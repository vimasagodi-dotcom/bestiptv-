import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommunityChatView } from '../components/CommunityChatView';
import { ContentBrowser } from '../components/ContentBrowser';
import { LiveTvView } from '../components/LiveTvView';
import { EmptyView, Loading } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useAsync } from '../hooks/useAsync';
import { formatDate, formatTime } from '../lib/utils';
import { colors, radius } from '../theme';

type TabKey = 'live' | 'vod' | 'series' | 'chat' | 'portals';

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'live', label: 'TV em Direto', icon: 'tv-outline', iconActive: 'tv' },
  { key: 'vod', label: 'Filmes (VOD)', icon: 'film-outline', iconActive: 'film' },
  { key: 'series', label: 'Séries', icon: 'albums-outline', iconActive: 'albums' },
  { key: 'chat', label: 'Chat', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { key: 'portals', label: 'Portais', icon: 'server-outline', iconActive: 'server' },
];

export default function Home() {
  const { ready, active, playlists, selectPlaylist, removePlaylist, provider, reload } = useApp();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('live');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const account = useAsync(async () => (provider ? provider.getAccountInfo() : null), [provider]);

  if (!ready) return <Loading />;
  if (!active) return <Redirect href="/playlists" />;

  const exp = account.data?.expDate;
  const hideBars = isFullscreen && tab === 'live';

  return (
    <View style={[styles.root, !hideBars && { paddingTop: insets.top }]}>
      <StatusBar hidden={hideBars} style="light" />

      {/* Main Content Area */}
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, display: tab === 'live' ? 'flex' : 'none' }}>
          <LiveTvView activeTab={tab === 'live'} onFullscreenChange={setIsFullscreen} />
        </View>

        {tab === 'vod' && (
          <View style={{ flex: 1, paddingTop: 8 }}>
            {provider ? (
              <ContentBrowser
                kind="movie"
                layout="grid"
                deps={[provider]}
                loadCategories={() => provider.getMovieCategories()}
                loadItems={() => provider.getMovies()}
                onOpen={(item) => router.push({ pathname: '/movie/[id]', params: { id: item.id } })}
              />
            ) : (
              <EmptyView message="Sem portal ativo" />
            )}
          </View>
        )}

        {tab === 'series' && (
          <View style={{ flex: 1, paddingTop: 8 }}>
            {provider ? (
              <ContentBrowser
                kind="series"
                layout="grid"
                deps={[provider]}
                loadCategories={() => provider.getSeriesCategories()}
                loadItems={() => provider.getSeries()}
                onOpen={(item) => router.push({ pathname: '/series/[id]', params: { id: item.id } })}
              />
            ) : (
              <EmptyView message="Sem portal ativo" />
            )}
          </View>
        )}

        {tab === 'chat' && (
          <View style={{ flex: 1 }}>
            <CommunityChatView activeTab={tab === 'chat'} />
          </View>
        )}

        {tab === 'portals' && (
          <ScrollView contentContainerStyle={styles.portalsContainer}>
            {/* Active Portal Status Card */}
            <View style={styles.portalActiveCard}>
              <View style={styles.portalCardHeader}>
                <View style={styles.statusDot} />
                <Text style={styles.portalActiveLabel}>PORTAL LIGADO</Text>
              </View>
              <Text style={styles.portalActiveTitle}>{active.name}</Text>
              <Text style={styles.portalActiveMeta}>
                {active.panelUsername
                  ? `⭐ Membro Comunidade Cocas (${active.panelUsername}) · Sem Publicidade`
                  : active.type === 'xtream'
                  ? `Linha Própria Xtream · ${active.server}`
                  : 'Linha Própria M3U'}
              </Text>

              <View style={styles.portalStatsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Estado</Text>
                  <Text style={[styles.statVal, { color: colors.success }]}>
                    {account.data?.status ?? 'Ativo'}
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Expiração</Text>
                  <Text style={styles.statVal}>
                    {exp ? formatDate(exp) : 'Ilimitado'}
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Ligações</Text>
                  <Text style={styles.statVal}>
                    {account.data?.activeConnections ?? '0'} / {account.data?.maxConnections ?? '1'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Os Meus Portais / Contas</Text>
              <Pressable
                onPress={() => router.push('/playlist-form')}
                style={styles.addPortalBtn}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addPortalText}>Novo Login / Portal</Text>
              </Pressable>
            </View>

            {playlists.map((p) => {
              const isCurrent = p.id === active.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={async () => {
                    await selectPlaylist(p.id);
                    setTab('live');
                  }}
                  style={[styles.portalRow, isCurrent && styles.portalRowActive]}
                >
                  <View style={[styles.portalIcon, isCurrent && { backgroundColor: colors.primary }]}>
                    <Ionicons name={p.type === 'xtream' ? 'globe-outline' : 'list'} size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.portalRowName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.portalRowSub} numberOfLines={1}>
                      {p.panelUsername
                        ? `Membro Cocas (${p.panelUsername})`
                        : p.type === 'xtream'
                        ? `${p.username} @ ${p.server}`
                        : p.url}
                    </Text>
                  </View>
                  <Pressable
                    hitSlop={8}
                    onPress={() => router.push({ pathname: '/playlist-form', params: { id: p.id } })}
                    style={styles.iconAction}
                  >
                    <Ionicons name="create-outline" size={20} color={colors.textMuted} />
                  </Pressable>
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      Alert.alert('Remover portal', `Eliminar "${p.name}"?`, [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Eliminar', style: 'destructive', onPress: () => removePlaylist(p.id) },
                      ])
                    }
                    style={styles.iconAction}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </Pressable>
                </Pressable>
              );
            })}

            {/* Legal Disclaimer Card */}
            <View style={styles.legalNoticeBox}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.textMuted} />
              <Text style={styles.legalNoticeText}>
                Aviso Legal: A Cocas é um reprodutor multimédia. Não fornece, aloja nem vende conteúdos. O utilizador é responsável por usar apenas fontes de que tem direitos legais.
              </Text>
            </View>
          </ScrollView>
        )}
      </View>

      {/* Bottom Tab Bar (hidden in fullscreen video mode) */}
      {!hideBars && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {TABS.map((t) => {
            const isSelected = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={styles.tabItem}
              >
                {isSelected && <View style={styles.tabIndicator} />}
                <Ionicons
                  name={isSelected ? t.iconActive : t.icon}
                  size={20}
                  color={isSelected ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.tabLabel, isSelected && styles.tabLabelActive]} numberOfLines={1}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  portalSub: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clockText: { color: colors.text, fontSize: 14, fontWeight: '700', marginRight: 4 },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: -7,
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  tabLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  tabLabelActive: { color: '#fff', fontWeight: '800' },
  portalsContainer: { padding: 16, gap: 16, paddingBottom: 40 },
  portalActiveCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  portalCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  portalActiveLabel: { color: colors.success, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  portalActiveTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  portalActiveMeta: { color: colors.textMuted, fontSize: 13 },
  portalStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statBox: { flex: 1, gap: 2 },
  statLabel: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' },
  statVal: { color: colors.text, fontSize: 14, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  addPortalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  addPortalText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  portalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  portalRowActive: { borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  portalIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalRowName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  portalRowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  iconAction: { padding: 6 },
  legalNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  legalNoticeText: { flex: 1, color: colors.textMuted, fontSize: 11, lineHeight: 16 },
});
