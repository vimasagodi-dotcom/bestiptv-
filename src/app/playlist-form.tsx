import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Field, ScreenHeader } from '../components/ui';
import { useApp } from '../context/AppContext';
import { M3UProvider } from '../lib/m3u';
import type { LiveFormat, Playlist, PlaylistType } from '../lib/types';
import { normalizeServer, parseXtreamM3uUrl, uid } from '../lib/utils';
import { XtreamProvider } from '../lib/xtream';
import { colors, radius } from '../theme';

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
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segItem, value === o.value && styles.segActive]}>
          <Text style={[styles.segText, value === o.value && { color: '#fff' }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function PlaylistForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { playlists, addPlaylist, updatePlaylist } = useApp();
  const editing = playlists.find((p) => p.id === id);

  const [type, setType] = useState<PlaylistType>(editing?.type ?? 'xtream');
  const [name, setName] = useState(editing?.name ?? '');
  const [server, setServer] = useState(editing?.server ?? '');
  const [username, setUsername] = useState(editing?.username ?? '');
  const [password, setPassword] = useState(editing?.password ?? '');
  const [url, setUrl] = useState(editing?.url ?? '');
  const [userAgent, setUserAgent] = useState(editing?.userAgent ?? '');
  const [liveFormat, setLiveFormat] = useState<LiveFormat>(editing?.liveFormat ?? 'm3u8');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    let p: Playlist = {
      id: editing?.id ?? uid(),
      createdAt: editing?.createdAt ?? Date.now(),
      name: name.trim(),
      type,
      userAgent: userAgent.trim() || undefined,
      liveFormat,
    };

    if (type === 'xtream') {
      if (!server.trim() || !username.trim() || !password) {
        Alert.alert('Dados em falta', 'Preencha o servidor, utilizador e palavra-passe.');
        return;
      }
      p = { ...p, server: normalizeServer(server), username: username.trim(), password };
    } else {
      if (!url.trim()) {
        Alert.alert('Dados em falta', 'Indique o URL da lista M3U.');
        return;
      }
      // Xtream-style M3U links are converted to Xtream (more features: EPG, info, séries)
      const xt = parseXtreamM3uUrl(url);
      p = xt ? { ...p, type: 'xtream', ...xt } : { ...p, url: url.trim() };
    }
    if (!p.name) p.name = p.type === 'xtream' ? (p.server ?? '').replace(/^https?:\/\//, '') : 'Lista M3U';

    setSaving(true);
    try {
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
      <ScreenHeader title={editing ? 'Editar playlist' : 'Nova playlist'} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: 'xtream', label: 'Xtream Codes' },
              { value: 'm3u', label: 'URL M3U' },
            ]}
          />

          <Field label="Nome da playlist" value={name} onChangeText={setName} placeholder="Ex: A minha TV" autoCapitalize="sentences" />

          {type === 'xtream' ? (
            <>
              <Field label="URL do servidor" value={server} onChangeText={setServer} placeholder="http://servidor.com:8080" keyboardType="url" />
              <Field label="Utilizador" value={username} onChangeText={setUsername} placeholder="username" />
              <Field label="Palavra-passe" value={password} onChangeText={setPassword} placeholder="password" secureTextEntry />
            </>
          ) : (
            <Field
              label="URL da lista M3U"
              value={url}
              onChangeText={setUrl}
              placeholder="http://exemplo.com/lista.m3u"
              keyboardType="url"
              multiline
            />
          )}

          <Text style={styles.section}>Avançado</Text>
          {type === 'xtream' && (
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
              <Text style={styles.hint}>HLS é recomendado (compatível com iOS e Android).</Text>
            </View>
          )}
          <Field label="User-Agent (opcional)" value={userAgent} onChangeText={setUserAgent} placeholder="Ex: VLC/3.0.0" />

          <Button title={editing ? 'Guardar' : 'Adicionar'} icon="checkmark" onPress={save} loading={saving} />
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
  segItem: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  segActive: { backgroundColor: colors.primary },
  segText: { color: colors.textMuted, fontWeight: '700' },
  section: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 8 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 12 },
});
