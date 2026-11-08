import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
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
  adminDeleteUser,
  adminFetchUsers,
  adminSaveUser,
  getLocalPanelUsers,
  type PanelUserRecord,
  saveLocalPanelUsers,
} from '../lib/panel';
import { normalizeServer, parseXtreamM3uUrl, uid } from '../lib/utils';
import { colors, radius } from '../theme';

export default function AdminPanel() {
  const [adminPass, setAdminPass] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<PanelUserRecord[]>([]);

  // Form state for creating/editing a client login
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clientUser, setClientUser] = useState('');
  const [clientPass, setClientPass] = useState('');
  const [listName, setListName] = useState('');
  const [sourceMode, setSourceMode] = useState<'m3u' | 'xtream'>('m3u');
  const [m3uUrl, setM3uUrl] = useState('');
  const [server, setServer] = useState('');
  const [xtreamUser, setXtreamUser] = useState('');
  const [xtreamPass, setXtreamPass] = useState('');
  const [saving, setSaving] = useState(false);

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
      // If offline, allow local unlock with 'admin'
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
    setM3uUrl('');
    setServer('');
    setXtreamUser('');
    setXtreamPass('');
  };

  const onChangeM3u = (val: string) => {
    setM3uUrl(val);
    const xt = parseXtreamM3uUrl(val);
    if (xt) {
      setServer(xt.server);
      setXtreamUser(xt.username);
      setXtreamPass(xt.password);
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
      Alert.alert('Lista em falta', 'Cole o link M3U da lista IPTV.');
      return;
    }
    if (sourceMode === 'xtream' && (!server.trim() || !xtreamUser.trim() || !xtreamPass.trim())) {
      Alert.alert('Dados Xtream em falta', 'Preencha o Servidor, Utilizador e Password da linha Xtream.');
      return;
    }

    setSaving(true);
    try {
      const xt = parseXtreamM3uUrl(m3uUrl || server);
      const record: Partial<PanelUserRecord> = {
        id: editingId ?? uid(),
        username: usr,
        password: pwd,
        name: listName.trim() || `KikoIPTV (${usr})`,
        active: true,
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
        // Offline local fallback
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
        'Utilizador guardado',
        `O acesso "${usr}" foi configurado! Já pode entrar na opção "Login KikoIPTV" apenas com este utilizador e password.`,
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
    setM3uUrl(u.m3uUrl ?? '');
    setServer(u.server ?? '');
    setXtreamUser(u.xtreamUser ?? '');
    setXtreamPass(u.xtreamPass ?? '');
    setSourceMode(u.playlistType === 'xtream' && !u.m3uUrl ? 'xtream' : 'm3u');
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Painel de Controlo" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!unlocked ? (
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
              <View style={styles.badgeRow}>
                <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
                <Text style={styles.cardTitle}>Acesso de Administrador</Text>
              </View>
              <Text style={styles.cardSub}>
                Gerencie aqui as listas IPTV e defina o Utilizador e Palavra-passe para login direto na aplicação (ou na web em kikoiptv.vercel.app/painel).
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
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={styles.cardTitle}>
                  {editingId ? `Editar Acesso: ${clientUser}` : 'Novo Utilizador / Lista'}
                </Text>
                {editingId && (
                  <Pressable onPress={resetForm}>
                    <Text style={{ color: colors.primary, fontWeight: '700' }}>Cancelar</Text>
                  </Pressable>
                )}
              </View>
              <Text style={styles.cardSub}>
                Defina o Utilizador e a Password que usará para entrar na opção "Login KikoIPTV" e associe a lista IPTV.
              </Text>

              <Field
                label="Utilizador (para Login na App)"
                value={clientUser}
                onChangeText={setClientUser}
                placeholder="Ex: kiko ou cliente1"
              />
              <Field
                label="Palavra-passe (para Login na App)"
                value={clientPass}
                onChangeText={setClientPass}
                placeholder="Ex: 123456"
              />
              <Field
                label="Nome da Lista (opcional)"
                value={listName}
                onChangeText={setListName}
                placeholder="Ex: KikoIPTV Principal"
                autoCapitalize="sentences"
              />

              <Text style={styles.sectionLabel}>Fonte da Lista IPTV</Text>
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
                  label="Link M3U completo (extrai Xtream automaticamente)"
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

              <Button
                title={editingId ? 'Atualizar Utilizador' : 'Guardar no Painel'}
                icon="save-outline"
                onPress={handleSaveUser}
                loading={saving}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Utilizadores Registados ({users.length})</Text>
              {users.length === 0 ? (
                <Text style={styles.cardSub}>Ainda não existem utilizadores criados no painel.</Text>
              ) : (
                users.map((u) => (
                  <View key={u.id} style={styles.userRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>
                        👤 {u.username} <Text style={styles.userPass}>(Pass: {u.password})</Text>
                      </Text>
                      <Text style={styles.userMeta} numberOfLines={1}>
                        {u.name} · {u.playlistType === 'xtream' ? `Xtream (${u.server})` : 'M3U'}
                      </Text>
                    </View>
                    <Pressable onPress={() => handleEdit(u)} style={styles.iconBtn}>
                      <Ionicons name="create-outline" size={20} color={colors.text} />
                    </Pressable>
                    <Pressable onPress={() => handleDelete(u)} style={styles.iconBtn}>
                      <Ionicons name="trash-outline" size={20} color={colors.danger} />
                    </Pressable>
                  </View>
                ))
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  cardSub: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  segBtnActive: { backgroundColor: colors.primary },
  segText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  userPass: { color: colors.textMuted, fontSize: 13, fontWeight: '400' },
  userMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  iconBtn: { padding: 6 },
});

