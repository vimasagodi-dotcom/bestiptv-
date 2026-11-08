import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button, Field, ScreenHeader } from '../components/ui';
import { useApp } from '../context/AppContext';
import { M3UProvider } from '../lib/m3u';
import { loginWithPanelAccount } from '../lib/panel';
import type { LiveFormat, Playlist } from '../lib/types';
import { normalizeServer, parseXtreamM3uUrl, uid } from '../lib/utils';
import { XtreamProvider } from '../lib/xtream';
import { colors, radius } from '../theme';

type LoginMode = 'panel' | 'xtream' | 'm3u';

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.segItem, value === o.value && styles.segActive]}
        >
          <Text style={[styles.segText, value === o.value && { color: '#fff' }]} numberOfLines={1}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!visible}
          style={styles.passInput}
        />
        <Pressable hitSlop={10} onPress={() => setVisible((v) => !v)} style={styles.eyeBtn}>
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

export default function PlaylistForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { playlists, addPlaylist, updatePlaylist } = useApp();
  const editing = playlists.find((p) => p.id === id);

  const [mode, setMode] = useState<LoginMode>(editing ? editing.type : 'panel');
  const [name, setName] = useState(editing?.name ?? '');
  const [server, setServer] = useState(editing?.server ?? '');
  const [username, setUsername] = useState(editing?.username ?? '');
  const [password, setPassword] = useState(editing?.password ?? '');
  const [url, setUrl] = useState(editing?.url ?? '');
  const [userAgent, setUserAgent] = useState(editing?.userAgent ?? '');
  const [liveFormat, setLiveFormat] = useState<LiveFormat>(editing?.liveFormat ?? 'm3u8');
  const [saving, setSaving] = useState(false);

  const onChangeServer = (val: string) => {
    const xt = parseXtreamM3uUrl(val);
    if (xt) {
      setServer(xt.server);
      setUsername(xt.username);
      setPassword(xt.password);
    } else {
      setServer(val);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      let p: Playlist;

      if (mode === 'panel') {
        p = await loginWithPanelAccount(username, password);
        if (editing) p.id = editing.id;
      } else if (mode === 'xtream') {
        const xt = parseXtreamM3uUrl(server);
        const srv = (xt?.server ?? server).trim();
        const usr = (xt?.username ?? username).trim();
        const pwd = (xt?.password ?? password).trim();
        if (!srv || !usr || !pwd) {
          Alert.alert('Dados em falta', 'Preencha o servidor, utilizador e palavra-passe.');
          setSaving(false);
          return;
        }
        p = {
          id: editing?.id ?? uid(),
          createdAt: editing?.createdAt ?? Date.now(),
          name: name.trim() || srv.replace(/^https?:\/\//i, ''),
          type: 'xtream',
          server: normalizeServer(srv),
          username: usr,
          password: pwd,
          userAgent: userAgent.trim() || undefined,
          liveFormat,
        };
      } else {
        const rawUrl = url.trim();
        if (!rawUrl) {
          Alert.alert('Dados em falta', 'Indique o URL da lista M3U.');
          setSaving(false);
          return;
        }
        const xt = parseXtreamM3uUrl(rawUrl);
        p = xt
          ? {
              id: editing?.id ?? uid(),
              createdAt: editing?.createdAt ?? Date.now(),
              name: name.trim() || xt.server.replace(/^https?:\/\//i, ''),
              type: 'xtream',
              ...xt,
              userAgent: userAgent.trim() || undefined,
              liveFormat,
            }
          : {
              id: editing?.id ?? uid(),
              createdAt: editing?.createdAt ?? Date.now(),
              name: name.trim() || 'Lista M3U',
              type: 'm3u',
              url: rawUrl,
              userAgent: userAgent.trim() || undefined,
              liveFormat,
            };
      }

      if (p.type === 'xtream') await new XtreamProvider(p).authenticate();
      else await new M3UProvider(p).validate();

      if (editing) await updatePlaylist(p);
      else await addPlaylist(p);

      if (router.canDismiss()) router.dismissAll();
      router.replace('/');
    } catch (e: any) {
      Alert.alert('Não foi possível ligar', e?.message ?? 'Verifique os dados e a sua ligação à internet.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={editing ? 'Editar Portal' : 'Entrar / Adicionar Portal'} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'panel', label: 'Login Cocas' },
              { value: 'xtream', label: 'Xtream Codes' },
              { value: 'm3u', label: 'URL M3U' },
            ]}
          />

          {mode === 'panel' ? (
            <View style={styles.panelBox}>
              <View style={styles.panelInfoRow}>
                <Ionicons name="person-circle-outline" size={24} color={colors.primary} />
                <Text style={styles.panelInfoText}>
                  Introduza o seu <Text style={{ color: '#fff', fontWeight: '700' }}>Utilizador</Text> e{' '}
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Palavra-passe</Text> para entrar diretamente.
                </Text>
              </View>
              <Field
                label="Utilizador"
                value={username}
                onChangeText={setUsername}
                placeholder="O seu utilizador"
              />
              <PasswordField
                label="Palavra-passe"
                value={password}
                onChangeText={setPassword}
                placeholder="A sua palavra-passe"
              />
            </View>
          ) : mode === 'xtream' ? (
            <>
              <Field
                label="Nome do Portal (opcional)"
                value={name}
                onChangeText={setName}
                placeholder="Ex: A minha TV"
                autoCapitalize="sentences"
              />
              <Field
                label="URL do Servidor (ou cole o link M3U completo)"
                value={server}
                onChangeText={onChangeServer}
                placeholder="http://servidor.com:8080"
                keyboardType="url"
              />
              <Field
                label="Utilizador"
                value={username}
                onChangeText={setUsername}
                placeholder="username"
              />
              <PasswordField
                label="Palavra-passe"
                value={password}
                onChangeText={setPassword}
                placeholder="password"
              />
            </>
          ) : (
            <>
              <Field
                label="Nome da Lista (opcional)"
                value={name}
                onChangeText={setName}
                placeholder="Ex: A minha TV"
                autoCapitalize="sentences"
              />
              <Field
                label="URL da lista M3U"
                value={url}
                onChangeText={setUrl}
                placeholder="http://exemplo.com/get.php?username=...&password=..."
                keyboardType="url"
                multiline
              />
            </>
          )}

          {mode !== 'panel' && (
            <>
              <Text style={styles.section}>Avançado</Text>
              {mode === 'xtream' && (
                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Formato dos canais em direto</Text>
                  <Segmented
                    value={liveFormat}
                    onChange={setLiveFormat}
                    options={[
                      { value: 'm3u8', label: 'HLS (.m3u8)' },
                      { value: 'ts', label: 'MPEG-TS (.ts)' },
                    ]}
                  />
                  <Text style={styles.hint}>HLS é recomendado (compatível com iOS, Android e Smart TV).</Text>
                </View>
              )}
              <Field
                label="User-Agent (opcional)"
                value={userAgent}
                onChangeText={setUserAgent}
                placeholder="Ex: IPTVSmartersPlayer"
              />
            </>
          )}

          <Button
            title={editing ? 'Guardar Alterações' : 'Entrar / Ligar'}
            icon="log-in-outline"
            onPress={save}
            loading={saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: 16, gap: 16, paddingBottom: 60 },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segItem: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, borderRadius: radius.sm, alignItems: 'center' },
  segActive: { backgroundColor: colors.primary },
  segText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  panelBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  panelInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    padding: 12,
    borderRadius: radius.md,
  },
  panelInfoText: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  passWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  passInput: {
    flex: 1,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  section: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 8 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 12 },
});
