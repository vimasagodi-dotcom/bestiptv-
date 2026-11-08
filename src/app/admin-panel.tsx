import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button, Field, ScreenHeader } from '../components/ui';
import {
  addYearsToDate,
  adminDeleteUser,
  adminFetchUsers,
  adminSaveUser,
  getLocalPanelUsers,
  inspectLineExpiration,
  type PanelUserRecord,
  saveLocalPanelUsers,
  SUBSCRIPTION_PLANS,
} from '../lib/panel';
import { formatDate, normalizeServer, parseXtreamM3uUrl, uid } from '../lib/utils';
import { colors, radius } from '../theme';

export default function AdminPanel() {
  const [adminPass, setAdminPass] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<PanelUserRecord[]>([]);

  // Form state for creating/editing a client login & line
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clientUser, setClientUser] = useState('');
  const [clientPass, setClientPass] = useState('');
  const [listName, setListName] = useState('');
  const [planYears, setPlanYears] = useState<number>(1);
  const [sourceMode, setSourceMode] = useState<'m3u' | 'xtream'>('m3u');
  const [m3uUrl, setM3uUrl] = useState('');
  const [server, setServer] = useState('');
  const [xtreamUser, setXtreamUser] = useState('');
  const [xtreamPass, setXtreamPass] = useState('');

  // Auto-detected IPTV line expiration
  const [inspectingLine, setInspectingLine] = useState(false);
  const [detectedLineExp, setDetectedLineExp] = useState<number | null>(null);
  const [detectedLineMeta, setDetectedLineMeta] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const scrollRef = useRef<any>(null);
  const inspectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.years === planYears) ?? SUBSCRIPTION_PLANS[0];
  const previewAppExpDate = addYearsToDate(Date.now(), selectedPlan.years);

  const refreshUsersList = useCallback(
    async (silent = false) => {
      if (!adminPass.trim()) return;
      if (!silent) setRefreshing(true);
      try {
        const list = await adminFetchUsers(adminPass);
        setUsers(list);
      } catch {
        // Keep current list if offline
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [adminPass],
  );

  // Auto-refresh online status & current channel every 20 seconds while unlocked
  useEffect(() => {
    if (!unlocked) return;
    const t = setInterval(() => {
      refreshUsersList(true);
    }, 20000);
    return () => clearInterval(t);
  }, [unlocked, refreshUsersList]);

  const handleUnlock = async () => {
    const pass = adminPass.trim();
    if (!pass) {
      Alert.alert('Painel de Controlo', 'Introduza a palavra-passe de Administrador (padrão inicial: admin).');
      return;
    }
    setLoading(true);
    try {
      const list = await adminFetchUsers(pass);
      setUsers(list);
      setUnlocked(true);
    } catch (e: any) {
      if (pass === 'admin') {
        const local = await getLocalPanelUsers();
        setUsers(local);
        setUnlocked(true);
      } else {
        Alert.alert('Acesso negado', e?.message ?? 'Palavra-passe incorreta.');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setClientUser('');
    setClientPass('');
    setListName('');
    setPlanYears(1);
    setM3uUrl('');
    setServer('');
    setXtreamUser('');
    setXtreamPass('');
    setDetectedLineExp(null);
    setDetectedLineMeta(null);
  };

  const runLineCheck = useCallback(
    async (opts?: { m3u?: string; srv?: string; usr?: string; pwd?: string; silent?: boolean }) => {
      const targetM3u = opts?.m3u ?? m3uUrl;
      const targetSrv = opts?.srv ?? server;
      const targetUsr = opts?.usr ?? xtreamUser;
      const targetPwd = opts?.pwd ?? xtreamPass;

      setInspectingLine(true);
      try {
        const info = await inspectLineExpiration({
          m3uUrl: targetM3u,
          server: targetSrv,
          xtreamUser: targetUsr,
          xtreamPass: targetPwd,
        });
        setServer(info.server);
        setXtreamUser(info.username);
        setXtreamPass(info.password);
        setDetectedLineExp(info.expDate);
        setDetectedLineMeta(
          `Termina em: ${info.expDate ? formatDate(info.expDate) : 'Ilimitada'} · Estado: ${info.status} · Ligações: ${info.activeCons}/${info.maxCons}`,
        );
      } catch (e: any) {
        if (!opts?.silent) {
          Alert.alert('Verificar Linha', e?.message ?? 'Não foi possível ler a data desta linha.');
        }
      } finally {
        setInspectingLine(false);
      }
    },
    [m3uUrl, server, xtreamUser, xtreamPass],
  );

  const onChangeM3u = (val: string) => {
    setM3uUrl(val);
    const xt = parseXtreamM3uUrl(val);
    if (xt) {
      setServer(xt.server);
      setXtreamUser(xt.username);
      setXtreamPass(xt.password);
      if (inspectTimerRef.current) clearTimeout(inspectTimerRef.current);
      inspectTimerRef.current = setTimeout(() => {
        runLineCheck({ m3u: val, srv: xt.server, usr: xt.username, pwd: xt.password, silent: true });
      }, 450);
    }
  };

  const handleSaveUser = async () => {
    const usr = clientUser.trim();
    const pwd = clientPass.trim();
    if (!usr || !pwd) {
      Alert.alert('Dados em falta', 'Defina o Utilizador e a Palavra-passe que serão usados no login.');
      return;
    }
    if (sourceMode === 'm3u' && !m3uUrl.trim()) {
      Alert.alert('Linha em falta', 'Cole o link M3U da linha IPTV.');
      return;
    }
    if (sourceMode === 'xtream' && (!server.trim() || !xtreamUser.trim() || !xtreamPass.trim())) {
      Alert.alert('Dados Xtream em falta', 'Preencha o Servidor, Utilizador e Password da linha Xtream.');
      return;
    }

    setSaving(true);
    try {
      const xt = parseXtreamM3uUrl(m3uUrl || server);
      let lineExp = detectedLineExp;
      if (lineExp === null) {
        try {
          const info = await inspectLineExpiration({
            m3uUrl,
            server: xt ? xt.server : server,
            xtreamUser: xt ? xt.username : xtreamUser,
            xtreamPass: xt ? xt.password : xtreamPass,
          });
          lineExp = info.expDate;
        } catch {
          // continue even if server blocks direct inspection
        }
      }

      const appExpDate = addYearsToDate(Date.now(), selectedPlan.years);
      const record: Partial<PanelUserRecord> & { renewFromNow?: boolean } = {
        id: editingId ?? uid(),
        username: usr,
        password: pwd,
        name: listName.trim() || `KikoIPTV (${usr})`,
        active: true,
        planYears: selectedPlan.years,
        planPrice: selectedPlan.price,
        appExpDate,
        lineExpDate: lineExp,
        renewFromNow: true,
        playlistType: xt || sourceMode === 'xtream' ? 'xtream' : 'm3u',
        m3uUrl: m3uUrl.trim(),
        server: xt ? xt.server : normalizeServer(server),
        xtreamUser: xt ? xt.username : xtreamUser.trim(),
        xtreamPass: xt ? xt.password : xtreamPass.trim(),
        liveFormat: 'm3u8',
      };

      try {
        const updated = await adminSaveUser(adminPass, record);
        setUsers(updated);
      } catch {
        const local = await getLocalPanelUsers();
        const idx = local.findIndex((x) => x.id === record.id || x.username.toLowerCase() === usr.toLowerCase());
        const full = record as PanelUserRecord;
        if (idx >= 0) local[idx] = full;
        else local.unshift(full);
        await saveLocalPanelUsers(local);
        setUsers(local);
      }

      resetForm();
      Alert.alert(
        'Utilizador e Linha Guardados',
        `Utilizador: ${usr}\nPlano: ${selectedPlan.label} (${selectedPlan.priceLabel})\nValidade Login: ${formatDate(appExpDate)}${
          lineExp ? `\nFim da Linha IPTV: ${formatDate(lineExp)}` : ''
        }`,
      );
    } catch (e: any) {
      Alert.alert('Erro ao guardar', e?.message ?? 'Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (u: PanelUserRecord) => {
    setEditingId(u.id);
    setClientUser(u.username);
    setClientPass(u.password);
    setListName(u.name);
    setPlanYears(u.planYears ?? 1);
    const defaultM3u =
      u.m3uUrl ||
      (u.server && u.xtreamUser
        ? `${u.server}/get.php?username=${u.xtreamUser}&password=${u.xtreamPass}&type=m3u_plus&output=ts`
        : '');
    setM3uUrl(defaultM3u);
    setServer(u.server ?? '');
    setXtreamUser(u.xtreamUser ?? '');
    setXtreamPass(u.xtreamPass ?? '');
    setDetectedLineExp(u.lineExpDate ?? null);
    setDetectedLineMeta(
      u.lineExpDate
        ? `Termina em: ${formatDate(u.lineExpDate)} · Ligações: ${u.lineActiveCons ?? 0}/${u.lineMaxCons ?? 1}`
        : null,
    );
    setSourceMode(u.playlistType === 'xtream' && !u.m3uUrl ? 'xtream' : 'm3u');
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleDelete = (u: PanelUserRecord) => {
    Alert.alert('Eliminar Utilizador', `Remover o acesso de "${u.username}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            const updated = await adminDeleteUser(adminPass, u.id);
            setUsers(updated);
          } catch {
            const local = (await getLocalPanelUsers()).filter((x) => x.id !== u.id);
            await saveLocalPanelUsers(local);
            setUsers(local);
          }
        },
      },
    ]);
  };

  const onlineCount = users.filter((u) => u.isOnline).length;
  const totalRevenue = users.reduce((sum, u) => sum + Number(u.planPrice ?? 5), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Painel de Controlo Admin"
        right={
          unlocked ? (
            <Pressable onPress={() => refreshUsersList(false)} style={styles.refreshBtn}>
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.refreshBtnText}>{refreshing ? '...' : 'Atualizar'}</Text>
            </Pressable>
          ) : null
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!unlocked ? (
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
              <View style={styles.badgeRow}>
                <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
                <Text style={styles.cardTitle}>Acesso de Administrador</Text>
              </View>
              <Text style={styles.cardSub}>
                Veja quem está online e que canal está a ver, reconheça a data de fim das linhas IPTV e defina planos de 1 a 5 anos.
              </Text>
              <Field
                label="Password de Administrador"
                value={adminPass}
                onChangeText={setAdminPass}
                placeholder="Padrão inicial: admin"
                secureTextEntry
              />
              <Button title="Entrar no Painel" icon="lock-open-outline" onPress={handleUnlock} loading={loading} />
            </View>
          </ScrollView>
        ) : (
          <ScrollView ref={scrollRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            {/* TOP STATS */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Utilizadores</Text>
                <Text style={styles.statVal}>{users.length}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>🟢 Online</Text>
                <Text style={[styles.statVal, { color: colors.success }]}>{onlineCount}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Total Planos</Text>
                <Text style={[styles.statVal, { color: colors.accent }]}>{totalRevenue} €</Text>
              </View>
            </View>

            {/* CREATE / EDIT USER & LINE */}
            <View style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={styles.cardTitle}>
                  {editingId ? `✏️ Editar: ${clientUser}` : '➕ Inserir Utilizador e Linha'}
                </Text>
                {editingId && (
                  <Pressable onPress={resetForm} style={styles.cancelEditBtn}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Cancelar Edição</Text>
                  </Pressable>
                )}
              </View>

              <Field
                label="Utilizador (Login na App)"
                value={clientUser}
                onChangeText={setClientUser}
                placeholder="Ex: renato"
              />
              <Field
                label="Palavra-passe (Login na App)"
                value={clientPass}
                onChangeText={setClientPass}
                placeholder="Ex: 123456"
              />
              <Field
                label="Nome / Identificação (opcional)"
                value={listName}
                onChangeText={setListName}
                placeholder="Ex: KikoIPTV Sala"
                autoCapitalize="sentences"
              />

              {/* SUBSCRIPTION PLANS (1Y=5€, 2Y=9€, 3Y=13€, 4Y=16€, 5Y=19€) */}
              <Text style={styles.sectionLabel}>Plano de Validade do Login (1 a 5 Anos)</Text>
              <View style={styles.plansRow}>
                {SUBSCRIPTION_PLANS.map((p) => {
                  const activePlan = planYears === p.years;
                  return (
                    <Pressable
                      key={p.years}
                      onPress={() => setPlanYears(p.years)}
                      style={[styles.planOption, activePlan && styles.planOptionActive]}
                    >
                      <Text style={[styles.planYearsText, activePlan && { color: '#fff' }]}>{p.label}</Text>
                      <Text style={styles.planPriceText}>{p.priceLabel}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.planSummaryBanner}>
                <Ionicons name="calendar-outline" size={18} color={colors.accent} />
                <Text style={styles.planSummaryText}>
                  Login válido por{' '}
                  <Text style={{ color: '#fff', fontWeight: '800' }}>{selectedPlan.label}</Text> (Custo:{' '}
                  <Text style={{ color: colors.accent, fontWeight: '800' }}>{selectedPlan.priceLabel}</Text>) · Expira
                  em <Text style={{ color: '#fff', fontWeight: '800' }}>{formatDate(previewAppExpDate)}</Text>
                </Text>
              </View>

              {/* IPTV LINE INPUT & AUTO-EXPIRATION DETECTION */}
              <View style={styles.lineHeaderRow}>
                <Text style={styles.sectionLabel}>Linha IPTV do Utilizador</Text>
                <Pressable onPress={() => runLineCheck({ silent: false })} style={styles.detectBtn}>
                  {inspectingLine ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="search-outline" size={14} color="#fff" />
                      <Text style={styles.detectBtnText}>Ler Data da Linha</Text>
                    </>
                  )}
                </Pressable>
              </View>

              <View style={styles.segment}>
                <Pressable
                  onPress={() => setSourceMode('m3u')}
                  style={[styles.segBtn, sourceMode === 'm3u' && styles.segBtnActive]}
                >
                  <Text style={[styles.segText, sourceMode === 'm3u' && { color: '#fff' }]}>Link M3U</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSourceMode('xtream')}
                  style={[styles.segBtn, sourceMode === 'xtream' && styles.segBtnActive]}
                >
                  <Text style={[styles.segText, sourceMode === 'xtream' && { color: '#fff' }]}>Xtream Codes</Text>
                </Pressable>
              </View>

              {sourceMode === 'm3u' ? (
                <Field
                  label="Link M3U completo (reconhece a data da linha automaticamente)"
                  value={m3uUrl}
                  onChangeText={onChangeM3u}
                  placeholder="http://servidor:8080/get.php?username=...&password=..."
                  keyboardType="url"
                  multiline
                />
              ) : (
                <>
                  <Field
                    label="URL do Servidor Xtream"
                    value={server}
                    onChangeText={setServer}
                    placeholder="http://wh.gktxp.com:8080"
                    keyboardType="url"
                  />
                  <Field
                    label="Utilizador da Linha (Xtream)"
                    value={xtreamUser}
                    onChangeText={setXtreamUser}
                    placeholder="username da linha"
                  />
                  <Field
                    label="Password da Linha (Xtream)"
                    value={xtreamPass}
                    onChangeText={setXtreamPass}
                    placeholder="password da linha"
                  />
                </>
              )}

              {detectedLineMeta && (
                <View style={styles.detectedBox}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Text style={styles.detectedText}>📅 Linha Reconhecida: {detectedLineMeta}</Text>
                </View>
              )}

              <Button
                title={editingId ? 'Guardar Alterações na Linha / Utilizador' : 'Guardar Utilizador, Plano e Linha'}
                icon="save-outline"
                onPress={handleSaveUser}
                loading={saving}
              />
            </View>

            {/* USERS LIST WITH ONLINE STATUS, CURRENT CHANNEL & EXPIRATION DATES */}
            <View style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={styles.cardTitle}>👥 Utilizadores ({users.length})</Text>
                <Pressable onPress={() => refreshUsersList(false)}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>↻ Atualizar</Text>
                </Pressable>
              </View>

              {users.length === 0 ? (
                <Text style={styles.cardSub}>Ainda não existem utilizadores criados no painel.</Text>
              ) : (
                users.map((u) => {
                  const years = u.planYears ?? 1;
                  const price = u.planPrice ?? (SUBSCRIPTION_PLANS.find((p) => p.years === years)?.price ?? 5);
                  return (
                    <View key={u.id} style={[styles.userCard, u.isOnline && styles.userCardOnline]}>
                      <View style={styles.userCardTop}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <View style={styles.userBadgesWrap}>
                            <Text style={styles.userName}>👤 {u.username}</Text>
                            <Text style={styles.userPass}>({u.password})</Text>
                            <View style={[styles.statusBadge, u.isOnline ? styles.badgeOnline : styles.badgeOffline]}>
                              <Text style={[styles.statusBadgeText, u.isOnline && { color: '#34D399' }]}>
                                {u.isOnline ? '🟢 ONLINE' : '⚪ OFFLINE'}
                              </Text>
                            </View>
                            <View style={styles.planBadge}>
                              <Text style={styles.planBadgeText}>
                                {years} {years === 1 ? 'Ano' : 'Anos'} · {price} €
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* CURRENT CHANNEL WATCHING */}
                      {(u.isOnline || u.currentChannel) && (
                        <View style={styles.watchingBox}>
                          <Ionicons name="tv" size={15} color="#34D399" />
                          <Text style={styles.watchingText} numberOfLines={1}>
                            A ver agora: <Text style={{ fontWeight: '800', color: '#fff' }}>{u.currentChannel || 'Canal em Direto'}</Text>
                          </Text>
                        </View>
                      )}

                      {/* EXPIRATION DATES & LINE DETAILS */}
                      <View style={styles.metaGrid}>
                        <View style={styles.metaBox}>
                          <Text style={styles.metaLabel}>📅 Fim da Linha IPTV</Text>
                          <Text style={[styles.metaVal, { color: colors.success }]}>
                            {u.lineExpDate ? formatDate(u.lineExpDate) : 'Ilimitada / N/D'}
                          </Text>
                        </View>
                        <View style={styles.metaBox}>
                          <Text style={styles.metaLabel}>⏳ Validade Login ({years}A)</Text>
                          <Text style={[styles.metaVal, { color: colors.accent }]}>
                            {u.appExpDate ? formatDate(u.appExpDate) : 'Ilimitado'}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.lineUrlPreview} numberOfLines={1}>
                        🔗 Linha: {u.server ? `${u.server} (user: ${u.xtreamUser})` : u.m3uUrl}
                      </Text>

                      <View style={styles.userActionsRow}>
                        <Pressable onPress={() => handleEdit(u)} style={styles.editLineBtn}>
                          <Ionicons name="create-outline" size={16} color="#fff" />
                          <Text style={styles.editLineBtnText}>Editar Linha / Utilizador</Text>
                        </Pressable>
                        <Pressable onPress={() => handleDelete(u)} style={styles.deleteBtn}>
                          <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 60 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  statVal: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800', flex: 1 },
  cardSub: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  cancelEditBtn: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
  plansRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  planOption: {
    flex: 1,
    minWidth: 58,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  planOptionActive: {
    borderColor: colors.primary,
    backgroundColor: '#E5091422',
  },
  planYearsText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  planPriceText: { color: colors.accent, fontSize: 15, fontWeight: '800', marginTop: 2 },
  planSummaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planSummaryText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  lineHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  detectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detectBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segBtnActive: { backgroundColor: colors.primary },
  segText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  detectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10B9811A',
    borderColor: '#10B98155',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
  },
  detectedText: { flex: 1, color: '#A7F3D0', fontSize: 12, fontWeight: '700' },
  userCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  userCardOnline: {
    borderColor: colors.success,
  },
  userCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  userBadgesWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  userName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  userPass: { color: colors.textMuted, fontSize: 13 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  badgeOnline: { backgroundColor: '#10B98126' },
  badgeOffline: { backgroundColor: colors.surfaceAlt },
  statusBadgeText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  planBadge: {
    backgroundColor: '#F59E0B26',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  planBadgeText: { color: colors.accent, fontSize: 10, fontWeight: '800' },
  watchingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10B9811A',
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },
  watchingText: { flex: 1, color: '#A7F3D0', fontSize: 12, fontWeight: '600' },
  metaGrid: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  metaBox: { flex: 1, gap: 2 },
  metaLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  metaVal: { color: colors.text, fontSize: 13, fontWeight: '800' },
  lineUrlPreview: { color: colors.textMuted, fontSize: 11 },
  userActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  editLineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 9,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editLineBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: '#EF444422',
    borderWidth: 1,
    borderColor: '#EF444444',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
