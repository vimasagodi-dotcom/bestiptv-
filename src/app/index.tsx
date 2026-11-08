import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Loading } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useAsync } from '../hooks/useAsync';
import { formatDate, formatTime } from '../lib/utils';
import { colors, radius } from '../theme';

function Clock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={styles.clock}>{formatTime(now)}</Text>
      <Text style={styles.date}>{formatDate(now)}</Text>
    </View>
  );
}

const TILES = [
  { key: 'live', title: 'TV em Direto', icon: 'tv' as const, color: colors.live, href: '/live' as const },
  { key: 'movies', title: 'Filmes', icon: 'film' as const, color: colors.movies, href: '/movies' as const },
  { key: 'series', title: 'Séries', icon: 'albums' as const, color: colors.series, href: '/series' as const },
];

export default function Home() {
  const { ready, active, provider, reload } = useApp();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const account = useAsync(async () => (provider ? provider.getAccountInfo() : null), [provider]);

  if (!ready) return <Loading />;
  if (!active) return <Redirect href="/playlists" />;

  const exp = account.data?.expDate;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: Math.max(16, insets.left, insets.right),
        gap: 20,
        flexGrow: 1,
      }}
    >
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons name="play" size={20} color="#fff" />
          </View>
          <Text style={styles.brandText}>
            Kiko<Text style={{ color: colors.primary }}>IPTV</Text>
          </Text>
        </View>
        <Clock />
      </View>

      <View style={[styles.tiles, { flexDirection: landscape ? 'row' : 'column' }]}>
        {TILES.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => router.push(t.href)}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: t.color, opacity: pressed ? 0.85 : 1 },
              landscape ? { flex: 1, aspectRatio: 1.1 } : { height: 120 },
            ]}
          >
            <Ionicons name={t.icon} size={landscape ? 56 : 44} color="#fff" />
            <Text style={styles.tileText}>{t.title}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.info}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.infoLabel}>Playlist ativa</Text>
          <Text style={styles.infoTitle} numberOfLines={1}>
            {active.name}
          </Text>
          <Text style={styles.infoSub}>
            {active.type === 'xtream' ? 'Xtream Codes' : 'Lista M3U'}
            {account.data?.status ? ` · ${account.data.status}` : ''}
            {exp ? ` · Expira em ${formatDate(exp)}` : account.data && active.type === 'xtream' ? ' · Sem expiração' : ''}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <IconButton name="refresh" onPress={reload} />
          <IconButton name="create-outline" onPress={() => router.push({ pathname: '/playlist-form', params: { id: active.id } })} />
          <IconButton name="list" onPress={() => router.push('/playlists')} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { color: colors.text, fontSize: 26, fontWeight: '800' },
  clock: { color: colors.text, fontSize: 22, fontWeight: '700' },
  date: { color: colors.textMuted, fontSize: 12 },
  tiles: { gap: 14 },
  tile: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  tileText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  infoTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  infoSub: { color: colors.textMuted, fontSize: 13 },
});

