import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../context/AppContext';
import { useAsync } from '../hooks/useAsync';
import { sendPlayerHeartbeat } from '../lib/panel';
import type { EpgEntry, LiveChannel } from '../lib/types';
import { formatTime } from '../lib/utils';
import { colors, radius } from '../theme';
import { CommunityChatView } from './CommunityChatView';
import { ALL, FAV } from './ContentBrowser';
import { EmptyView, ErrorView, IconButton, Loading, SearchBar } from './ui';

const RECENT = '__recent';

export function LiveTvView({
  activeTab,
  onFullscreenChange,
}: {
  activeTab: boolean;
  onFullscreenChange?: (fs: boolean) => void;
}) {
  const { provider, active, favorites, recentLiveIds, isFavorite, toggleFavorite, addRecentLive, reload } = useApp();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isPhoneLandscape = width > height && Math.min(width, height) < 540;
  const isWide = width >= 700 && Math.min(width, height) >= 540;

  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const isFull = fullscreen || isPhoneLandscape;
  const [locked, setLocked] = useState(false);
  const [fit, setFit] = useState<'contain' | 'cover'>('contain');
  const [overlay, setOverlay] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [subView, setSubView] = useState<'channels' | 'chat'>('channels');

  // Fullscreen Live Chat Overlay (Read-only on TV/Live match) & Sponsor Banner
  const [fsChatVisible, setFsChatVisible] = useState(false);
  const [adConfig, setAdConfig] = useState<any>(null);

  useEffect(() => {
    fetch('https://www.cocas.online/api/panel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_ad_config' }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d.adConfig) setAdConfig(d.adConfig);
      })
      .catch(() => {});
  }, []);

  // Channel-switch Ad state for free users (users without a paid Cocas Community login)
  const isPaidMember = Boolean(active?.panelUsername);
  const [adVisible, setAdVisible] = useState(false);
  const [adCountdown, setAdCountdown] = useState(0);

  const triggerChannelSwitchAd = useCallback(() => {
    if (isPaidMember) return;
    setAdVisible(true);
    setAdCountdown(5);
  }, [isPaidMember]);

  useEffect(() => {
    if (!adVisible || adCountdown <= 0) return;
    const t = setTimeout(() => setAdCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [adVisible, adCountdown]);

  const { data, error, loading, retry } = useAsync(
    async () => {
      if (!provider) return { cats: [], items: [] as LiveChannel[] };
      const [cats, items] = await Promise.all([provider.getLiveCategories(), provider.getLiveChannels()]);
      return { cats, items };
    },
    [provider],
  );

  // Auto-select first channel (or most recent channel) once loaded
  useEffect(() => {
    if (!data?.items.length) return;
    if (selectedId && data.items.some((c) => c.id === selectedId)) return;
    const recent = recentLiveIds.find((id) => data.items.some((c) => c.id === id));
    setSelectedId(recent ?? data.items[0].id);
  }, [data, selectedId, recentLiveIds]);

  const categories = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const i of data.items) counts.set(i.categoryId, (counts.get(i.categoryId) ?? 0) + 1);
    const favCount = favorites.filter((f) => f.kind === 'live').length;
    const recCount = recentLiveIds.filter((id) => data.items.some((c) => c.id === id)).length;
    return [
      { id: ALL, name: 'Todos os Canais', count: data.items.length, icon: 'layers-outline' as const },
      { id: FAV, name: 'Favoritos', count: favCount, icon: 'star' as const },
      { id: RECENT, name: 'Recentes', count: recCount, icon: 'time-outline' as const },
      ...data.cats
        .map((c) => ({ ...c, count: counts.get(c.id) ?? 0, icon: 'folder-outline' as const }))
        .filter((c) => c.count > 0),
    ];
  }, [data, favorites, recentLiveIds]);

  const filteredChannels = useMemo(() => {
    if (!data) return [];
    let list = data.items;
    if (categoryId === FAV) {
      const ids = new Set(favorites.filter((f) => f.kind === 'live').map((f) => f.id));
      list = list.filter((i) => ids.has(i.id));
    } else if (categoryId === RECENT) {
      const map = new Map(data.items.map((i) => [i.id, i]));
      list = recentLiveIds.map((id) => map.get(id)).filter((x): x is LiveChannel => !!x);
    } else if (categoryId !== ALL) {
      list = list.filter((i) => i.categoryId === categoryId);
    }
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
    return list;
  }, [data, categoryId, search, favorites, recentLiveIds]);

  const currentChannel = useMemo(
    () => data?.items.find((c) => c.id === selectedId) ?? null,
    [data, selectedId],
  );

  // ---- Orientation & Back button for Fullscreen ----
  useEffect(() => {
    onFullscreenChange?.(isFull);
  }, [isFull, onFullscreenChange]);

  const enterFullscreen = useCallback(() => {
    setFullscreen(true);
    setOverlay(false);
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
  }, []);

  const exitFullscreen = useCallback(() => {
    setFullscreen(false);
    setDrawerOpen(false);
    setLocked(false);
    setOverlay(false);
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
      .then(() => {
        setTimeout(() => {
          ScreenOrientation.unlockAsync().catch(() => {});
        }, 1200);
      })
      .catch(() => {
        ScreenOrientation.unlockAsync().catch(() => {});
      });
  }, []);

  useEffect(() => {
    if (!isFull) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      exitFullscreen();
      return true;
    });
    return () => sub.remove();
  }, [isFull, drawerOpen, exitFullscreen]);

  // ---- Video Player with connection release & auto-retry ----
  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = false;
    p.showNowPlayingNotification = true;
  });
  const { status, error: playerError } = useEvent(player, 'statusChange', {
    status: player.status,
    error: undefined,
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const loadSeqRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadChannel = useCallback(
    (ch: LiveChannel | null, attempt = 0) => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      const seq = ++loadSeqRef.current;
      if (!ch || !activeTab) {
        try {
          player.pause();
          player.replace(null);
        } catch {}
        return;
      }
      setRetryCount(attempt);
      setRetrying(attempt > 0);
      try {
        player.pause();
      } catch {}

      // Wait briefly so single-connection Xtream servers release the previous socket
      const delay = attempt === 0 ? 140 : 900;
      retryTimerRef.current = setTimeout(() => {
        if (loadSeqRef.current !== seq) return;
        const uri = ch.url;
        const contentType = uri.includes('.m3u8') ? ('hls' as const) : undefined;
        player
          .replaceAsync({
            uri,
            contentType,
            headers: provider?.headers,
            metadata: { title: ch.name },
          })
          .then(() => {
            if (loadSeqRef.current === seq) {
              player.play();
              setRetrying(false);
            }
          })
          .catch(() => {});
      }, delay);
    },
    [player, provider, activeTab],
  );

  // Trigger load when channel or tab changes
  useEffect(() => {
    loadChannel(currentChannel, 0);
    if (currentChannel && activeTab) {
      addRecentLive(currentChannel.id);
    }
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChannel?.id, currentChannel?.url, activeTab]);

  // Ensure playback starts as soon as player transitions to readyToPlay
  useEffect(() => {
    if (status === 'readyToPlay' && activeTab && currentChannel) {
      setRetrying(false);
      if (!player.playing) {
        try {
          player.play();
        } catch {}
      }
    } else if (status === 'error' && activeTab && currentChannel && retryCount < 3) {
      // Auto-retry up to 3 times if server rejected initial switch
      loadChannel(currentChannel, retryCount + 1);
    }
  }, [status, activeTab, currentChannel, retryCount, player, loadChannel]);

  // Watchdog: if stuck in loading for >8s on first attempt, auto-reconnect once
  useEffect(() => {
    if (status !== 'loading' || !activeTab || !currentChannel || retryCount >= 2) return;
    const t = setTimeout(() => {
      loadChannel(currentChannel, retryCount + 1);
    }, 8000);
    return () => clearTimeout(t);
  }, [status, activeTab, currentChannel, retryCount, loadChannel]);

  // ---- Report online status & currently watched channel to Admin Panel ----
  useEffect(() => {
    if (!active || !activeTab || !currentChannel) {
      if (active) sendPlayerHeartbeat({ playlist: active, playing: false });
      return;
    }
    sendPlayerHeartbeat({ playlist: active, channelName: currentChannel.name, playing: true });
    const interval = setInterval(() => {
      sendPlayerHeartbeat({ playlist: active, channelName: currentChannel.name, playing: true });
    }, 45000);
    return () => {
      clearInterval(interval);
    };
  }, [active, activeTab, currentChannel]);

  // ---- EPG for current channel ----
  const [epg, setEpg] = useState<EpgEntry[]>([]);
  useEffect(() => {
    setEpg([]);
    if (!currentChannel || !provider) return;
    let alive = true;
    provider
      .getShortEpg(currentChannel)
      .then((list) => alive && setEpg(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [currentChannel, provider]);

  const nowEpg = epg[0];
  const nextEpg = epg[1];
  const epgProgress = nowEpg
    ? Math.min(1, Math.max(0, (Date.now() - nowEpg.start) / Math.max(1, nowEpg.end - nowEpg.start)))
    : 0;

  // ---- Fullscreen overlay timer ----
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpOverlay = useCallback(() => {
    setOverlay(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOverlay(false), 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const zap = useCallback(
    (delta: number) => {
      const list = filteredChannels.length ? filteredChannels : (data?.items ?? []);
      if (!list.length) return;
      const curIdx = list.findIndex((c) => c.id === selectedId);
      const nextIdx = curIdx >= 0 ? (curIdx + delta + list.length) % list.length : 0;
      triggerChannelSwitchAd();
      setSelectedId(list[nextIdx].id);
    },
    [filteredChannels, data, selectedId, triggerChannelSwitchAd],
  );

  const onSelectChannel = (ch: LiveChannel) => {
    if (ch.id === selectedId) {
      // Tapping the already playing channel toggles fullscreen (MYTVOnline+ behavior)
      enterFullscreen();
    } else {
      triggerChannelSwitchAd();
      setSelectedId(ch.id);
    }
  };

  if (loading) return <Loading label="A sincronizar portal e canais..." />;
  if (error) return <ErrorView message={error} onRetry={retry} />;
  if (!data?.items.length) return <EmptyView icon="tv-outline" message="Nenhum canal em direto disponível nesta lista." />;

  const isFav = currentChannel ? isFavorite('live', currentChannel.id) : false;
  const showSpinner = status === 'loading' || status === 'idle' || retrying;
  const showError = status === 'error' && !retrying && retryCount >= 3;

  // ---- Docked Player Surface (Portrait / Wide Tablet) ----
  const playerBox = (
    <View style={isWide ? styles.widePlayerWrap : styles.dockedPlayerWrap}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={fit}
        nativeControls={false}
        allowsPictureInPicture
      />

      {showSpinner && (
        <View style={styles.playerCenter} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
          {retrying && <Text style={styles.retryingText}>A ligar ao canal ({retryCount}/3)...</Text>}
        </View>
      )}

      {showError && (
        <View style={styles.playerCenter}>
          <Ionicons name="warning-outline" size={36} color={colors.danger} />
          <Text style={styles.errorTitle}>Canal temporariamente indisponível</Text>
          {playerError?.message ? (
            <Text style={styles.errorSub} numberOfLines={2}>
              {playerError.message}
            </Text>
          ) : null}
          <Pressable onPress={() => loadChannel(currentChannel, 1)} style={styles.retryBtn}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryBtnText}>Reconectar</Text>
          </Pressable>
        </View>
      )}

      {/* Channel-switch Ad Overlay for Free Users (non-Community members) */}
      {adVisible && !isPaidMember && (
        <View style={styles.adOverlay}>
          <View style={styles.adCard}>
            <View style={styles.adBadgeRow}>
              <Text style={styles.adTag}>PUBLICIDADE · COMUNIDADE COCAS</Text>
              {adCountdown > 0 ? (
                <Text style={styles.adTimerText}>Fechar em {adCountdown}s</Text>
              ) : (
                <Pressable onPress={() => setAdVisible(false)} style={styles.adCloseBtn}>
                  <Text style={styles.adCloseBtnText}>Fechar ✕</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.adTitle}>Torne-se Membro VIP da Comunidade Cocas</Text>
            <Text style={styles.adDesc}>
              Remova toda a publicidade ao mudar de canal e receba estatuto VIP no Chat da Comunidade:
            </Text>
            <Text style={styles.adPlans}>
              1 Ano: 5€ · 2 Anos: 9€ · 3 Anos: 13€ · 4 Anos: 16€ · 5 Anos: 19€
            </Text>
          </View>
        </View>
      )}

      {/* Docked / Wide quick overlay controls */}
      <Pressable style={StyleSheet.absoluteFill} onPress={enterFullscreen}>
        <View style={styles.dockedBadges}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>DIRETO</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable
            hitSlop={10}
            onPress={() => loadChannel(currentChannel, 1)}
            style={styles.miniControlBtn}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
          </Pressable>
          <Pressable hitSlop={10} onPress={enterFullscreen} style={styles.miniControlBtn}>
            <Ionicons name="scan-outline" size={18} color="#fff" />
          </Pressable>
        </View>
      </Pressable>
    </View>
  );

  // ---- FULLSCREEN VIEW (TV reajustada à esquerda, Chat fixo de cima abaixo à direita, Banner na barra inferior) ----
  if (isFull) {
    return (
      <View style={styles.fsContainer}>
        <StatusBar hidden />
        <View style={styles.fsMainLayout}>
          {/* Left Column: TV Player (reajustada ao lado esquerdo quando chat está aberto) */}
          <View style={styles.fsTvCol}>
            {/* Top Black Bar (Letterbox) with Logo / Channel Info */}
            {fsChatVisible && (
              <View
                style={[
                  styles.fsTopBarLetterbox,
                  {
                    paddingTop: Math.max(insets.top, 6),
                    paddingLeft: Math.max(insets.left, 12),
                  },
                ]}
              >
                <View style={styles.fsTopBrandingRow}>
                  {currentChannel?.icon ? (
                    <Image source={currentChannel.icon} style={styles.fsTopChannelLogo} contentFit="contain" />
                  ) : (
                    <View style={styles.fsTopBrandBadge}>
                      <Ionicons name="tv" size={13} color="#fff" />
                    </View>
                  )}
                  <View style={styles.fsTopNumBadge}>
                    <Text style={styles.fsTopNumText}>
                      {String(currentChannel?.num ?? 1).padStart(3, '0')}
                    </Text>
                  </View>
                  <Text style={styles.fsTopChannelName} numberOfLines={1}>
                    {currentChannel?.name || 'TV em Direto'}
                  </Text>
                  {nowEpg && (
                    <View style={styles.fsTopEpgBadge}>
                      <View style={styles.liveDot} />
                      <Text style={styles.fsTopEpgText} numberOfLines={1}>
                        {nowEpg.title}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Video View Surface */}
            <View style={styles.fsVideoSurface}>
              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit={fit}
                nativeControls={false}
                allowsPictureInPicture
              />

              {showSpinner && (
                <View style={styles.playerCenter} pointerEvents="none">
                  <ActivityIndicator size="large" color={colors.primary} />
                  {retrying && <Text style={styles.retryingText}>A ligar ao canal ({retryCount}/3)...</Text>}
                </View>
              )}

              {showError && (
                <View style={styles.playerCenter}>
                  <Ionicons name="warning-outline" size={36} color={colors.danger} />
                  <Text style={styles.errorTitle}>Canal temporariamente indisponível</Text>
                  {playerError?.message ? (
                    <Text style={styles.errorSub} numberOfLines={2}>
                      {playerError.message}
                    </Text>
                  ) : null}
                  <Pressable onPress={() => loadChannel(currentChannel, 1)} style={styles.retryBtn}>
                    <Ionicons name="refresh" size={16} color="#fff" />
                    <Text style={styles.retryBtnText}>Reconectar</Text>
                  </Pressable>
                </View>
              )}

              {/* Channel-switch Ad Overlay for Free Users */}
              {adVisible && !isPaidMember && (
                <View style={styles.adOverlay}>
                  <View style={styles.adCard}>
                    <View style={styles.adBadgeRow}>
                      <Text style={styles.adTag}>PUBLICIDADE · COMUNIDADE COCAS</Text>
                      {adCountdown > 0 ? (
                        <Text style={styles.adTimerText}>Fechar em {adCountdown}s</Text>
                      ) : (
                        <Pressable onPress={() => setAdVisible(false)} style={styles.adCloseBtn}>
                          <Text style={styles.adCloseBtnText}>Fechar ✕</Text>
                        </Pressable>
                      )}
                    </View>
                    <Text style={styles.adTitle}>Torne-se Membro VIP da Comunidade Cocas</Text>
                    <Text style={styles.adDesc}>
                      Remova toda a publicidade ao mudar de canal e receba estatuto VIP no Chat da Comunidade:
                    </Text>
                    <Text style={styles.adPlans}>
                      1 Ano: 5€ · 2 Anos: 9€ · 3 Anos: 13€ · 4 Anos: 16€ · 5 Anos: 19€
                    </Text>
                  </View>
                </View>
              )}

              {/* Fullscreen Overlay click to toggle controls */}
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => (overlay ? setOverlay(false) : bumpOverlay())}
              />

              {/* Lock Button */}
              {overlay && locked && (
                <View style={[styles.lockFloating, { top: insets.top + 16, left: Math.max(insets.left, 20) }]}>
                  <Pressable
                    onPress={() => {
                      setLocked(false);
                      bumpOverlay();
                    }}
                    style={styles.osdCircleBtnActive}
                  >
                    <Ionicons name="lock-closed" size={22} color="#fff" />
                  </Pressable>
                  <Text style={styles.lockHint}>Toque para desbloquear</Text>
                </View>
              )}

              {/* Fullscreen OSD Controls */}
              {overlay && !locked && (
                <>
                  {/* Top OSD Bar */}
                  <View
                    style={[
                      styles.fsTopBar,
                      {
                        paddingTop: insets.top + 8,
                        paddingLeft: Math.max(insets.left, 16),
                        paddingRight: Math.max(insets.right, 16),
                      },
                    ]}
                  >
                    <Pressable onPress={exitFullscreen} style={styles.osdCircleBtn}>
                      <Ionicons name="chevron-down" size={24} color="#fff" />
                    </Pressable>
                    <Pressable
                      onPress={() => setDrawerOpen((v) => !v)}
                      style={[styles.osdPillBtn, drawerOpen && { backgroundColor: colors.primary }]}
                    >
                      <Ionicons name="list" size={18} color="#fff" />
                      <Text style={styles.osdPillText}>Canais</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setFsChatVisible((v) => !v)}
                      style={[styles.osdPillBtn, fsChatVisible && { backgroundColor: '#E50914' }]}
                    >
                      <Ionicons name="chatbubbles" size={17} color="#fff" />
                      <Text style={styles.osdPillText}>Chat</Text>
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    <Pressable
                      onPress={() => setFit((f) => (f === 'contain' ? 'cover' : 'contain'))}
                      style={styles.osdPillBtn}
                    >
                      <Ionicons name="resize-outline" size={17} color="#fff" />
                      <Text style={styles.osdPillText}>{fit === 'contain' ? '16:9' : 'Preencher'}</Text>
                    </Pressable>
                    <Pressable onPress={() => loadChannel(currentChannel, 1)} style={styles.osdCircleBtn}>
                      <Ionicons name="refresh" size={20} color="#fff" />
                    </Pressable>
                    <Pressable onPress={() => setLocked(true)} style={styles.osdCircleBtn}>
                      <Ionicons name="lock-open-outline" size={20} color="#fff" />
                    </Pressable>
                  </View>

                  {/* Center Zap Controls */}
                  <View style={styles.fsCenterControls} pointerEvents="box-none">
                    <Pressable
                      onPress={() => {
                        zap(-1);
                        bumpOverlay();
                      }}
                      style={styles.osdZapBtn}
                    >
                      <Ionicons name="play-skip-back" size={26} color="#fff" />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (isPlaying) player.pause();
                        else player.play();
                        bumpOverlay();
                      }}
                      style={styles.osdPlayBtn}
                    >
                      <Ionicons name={isPlaying ? 'pause' : 'play'} size={34} color="#fff" />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        zap(1);
                        bumpOverlay();
                      }}
                      style={styles.osdZapBtn}
                    >
                      <Ionicons name="play-skip-forward" size={26} color="#fff" />
                    </Pressable>
                  </View>

                  {/* Bottom Channel Info & EPG Card */}
                  <View
                    style={[
                      styles.fsBottomCard,
                      {
                        marginBottom: Math.max(insets.bottom, 12),
                        marginLeft: Math.max(insets.left, 16),
                        marginRight: Math.max(insets.right, 16),
                      },
                    ]}
                  >
                    <View style={styles.fsChannelHeader}>
                      <View style={styles.fsNumBadge}>
                        <Text style={styles.fsNumText}>
                          {String(currentChannel?.num ?? 1).padStart(3, '0')}
                        </Text>
                      </View>
                      <View style={styles.fsLogoBox}>
                        {currentChannel?.icon ? (
                          <Image source={currentChannel.icon} style={styles.fsLogo} contentFit="contain" />
                        ) : (
                          <Ionicons name="tv-outline" size={22} color={colors.textMuted} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fsChTitle} numberOfLines={1}>
                          {currentChannel?.name}
                        </Text>
                        <Text style={styles.fsPortalSub} numberOfLines={1}>
                          {active?.name} · HLS
                        </Text>
                      </View>
                      {currentChannel && (
                        <Pressable
                          hitSlop={10}
                          onPress={() =>
                            toggleFavorite({
                              kind: 'live',
                              id: currentChannel.id,
                              name: currentChannel.name,
                              icon: currentChannel.icon,
                            })
                          }
                        >
                          <Ionicons
                            name={isFav ? 'star' : 'star-outline'}
                            size={24}
                            color={isFav ? colors.accent : '#fff'}
                          />
                        </Pressable>
                      )}
                    </View>

                    <View style={styles.fsEpgBox}>
                      {nowEpg ? (
                        <>
                          <View style={styles.fsEpgRow}>
                            <View style={styles.epgTagNow}>
                              <Text style={styles.epgTagText}>AGORA</Text>
                            </View>
                            <Text style={styles.fsEpgTime}>
                              {formatTime(nowEpg.start)} - {formatTime(nowEpg.end)}
                            </Text>
                            <Text style={styles.fsEpgTitle} numberOfLines={1}>
                              {nowEpg.title}
                            </Text>
                          </View>
                          <View style={styles.epgBarBg}>
                            <View style={[styles.epgBarFg, { width: `${epgProgress * 100}%` }]} />
                          </View>
                          {nextEpg && (
                            <View style={styles.fsEpgRow}>
                              <View style={styles.epgTagNext}>
                                <Text style={styles.epgTagNextText}>A SEGUIR</Text>
                              </View>
                              <Text style={styles.fsEpgTime}>
                                {formatTime(nextEpg.start)} - {formatTime(nextEpg.end)}
                              </Text>
                              <Text style={styles.fsEpgNextTitle} numberOfLines={1}>
                                {nextEpg.title}
                              </Text>
                            </View>
                          )}
                        </>
                      ) : (
                        <Text style={styles.noEpgText}>Sem informação de programação (EPG)</Text>
                      )}
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* Bottom Black Bar (Letterbox) with Sponsor Pub Banner — ONLY in fullscreen */}
            {adConfig?.bannerEnabled !== false && !locked && (
              <View
                style={[
                  styles.fsBottomBarLetterbox,
                  {
                    paddingBottom: Math.max(insets.bottom, 6),
                    paddingLeft: Math.max(insets.left, 12),
                    paddingRight: 12,
                  },
                ]}
              >
                <View style={styles.fsBottomSponsorBanner}>
                  <View style={styles.sponsorBadge}>
                    <Text style={styles.sponsorBadgeText}>PUB</Text>
                  </View>
                  {adConfig?.bannerImageUrl ? (
                    <Image source={adConfig.bannerImageUrl} style={styles.sponsorLogo} contentFit="contain" />
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sponsorMainText} numberOfLines={1}>
                      {adConfig?.bannerText || 'DaPortas · Portas, Roupeiros e Soluções por Medida'}
                    </Text>
                    <Text style={styles.sponsorSubText} numberOfLines={1}>
                      {adConfig?.bannerSubtext || 'Visite daportas.pt · Qualidade e Design'}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Right Column: Fixed Live Chat Sidebar (occupying top to bottom, 100% height) */}
          {fsChatVisible && !locked && (
            <View
              style={[
                styles.fsChatColumnFixed,
                {
                  paddingTop: Math.max(insets.top, 6),
                  paddingBottom: Math.max(insets.bottom, 6),
                  paddingRight: Math.max(insets.right, 6),
                },
              ]}
            >
              <View style={styles.fsChatHeader}>
                <View style={styles.fsChatLiveDot} />
                <Text style={styles.fsChatTitle}>Chat em Direto</Text>
                <Pressable onPress={() => setFsChatVisible(false)} hitSlop={8} style={{ padding: 4 }}>
                  <Ionicons name="close" size={18} color="#fff" />
                </Pressable>
              </View>
              <View style={{ flex: 1 }}>
                <CommunityChatView activeTab={activeTab} compact readOnly />
              </View>
            </View>
          )}
        </View>

        {/* Left Channel & Category Drawer in Fullscreen (MYTVOnline+ style) */}
        {drawerOpen && !locked && (
          <View
            style={[
              styles.fsDrawer,
              {
                paddingTop: insets.top + 8,
                paddingBottom: insets.bottom + 8,
                paddingLeft: Math.max(insets.left, 8),
              },
            ]}
          >
            {/* Categories column */}
            <View style={styles.fsDrawerCats}>
              <Text style={styles.fsDrawerHeader}>GRUPOS</Text>
              <FlatList
                data={categories}
                keyExtractor={(c) => c.id}
                renderItem={({ item: c }) => (
                  <Pressable
                    onPress={() => setCategoryId(c.id)}
                    style={[styles.fsDrawerCatRow, c.id === categoryId && styles.fsDrawerCatActive]}
                  >
                    <Text
                      style={[styles.fsDrawerCatText, c.id === categoryId && { color: '#fff' }]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    <Text style={styles.fsDrawerCatCount}>{c.count}</Text>
                  </Pressable>
                )}
              />
            </View>
            {/* Channels column */}
            <View style={styles.fsDrawerChannels}>
              <View style={styles.fsDrawerTopRow}>
                <Text style={styles.fsDrawerHeader}>CANAIS ({filteredChannels.length})</Text>
                <IconButton name="close" size={20} onPress={() => setDrawerOpen(false)} />
              </View>
              <FlatList
                data={filteredChannels}
                keyExtractor={(c) => c.id}
                initialNumToRender={18}
                renderItem={({ item }) => {
                  const activeCh = item.id === selectedId;
                  return (
                    <Pressable
                      onPress={() => {
                        setSelectedId(item.id);
                        setDrawerOpen(false);
                      }}
                      style={[styles.fsDrawerChRow, activeCh && styles.fsDrawerChActive]}
                    >
                      <Text style={styles.fsDrawerChNum}>
                        {String(item.num ?? '').padStart(3, '0')}
                      </Text>
                      {item.icon ? (
                        <Image
                          source={item.icon}
                          style={styles.fsDrawerChLogo}
                          contentFit="contain"
                          recyclingKey={item.id}
                        />
                      ) : (
                        <Ionicons name="tv-outline" size={16} color={colors.textMuted} />
                      )}
                      <Text style={styles.fsDrawerChName} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            </View>
          </View>
        )}
      </View>
    );
  }

    // ---- Info + EPG Strip below the docked player ----
  const infoStrip = currentChannel && (
    <View style={styles.infoStrip}>
      <View style={styles.infoStripTop}>
        <View style={styles.chNumPill}>
          <Text style={styles.chNumPillText}>
            {String(currentChannel.num ?? 1).padStart(3, '0')}
          </Text>
        </View>
        <Text style={styles.infoChName} numberOfLines={1}>
          {currentChannel.name}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={() =>
            toggleFavorite({
              kind: 'live',
              id: currentChannel.id,
              name: currentChannel.name,
              icon: currentChannel.icon,
            })
          }
          style={styles.stripActionBtn}
        >
          <Ionicons name={isFav ? 'star' : 'star-outline'} size={20} color={isFav ? colors.accent : colors.textMuted} />
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={() => setSubView((v) => (v === 'chat' ? 'channels' : 'chat'))}
          style={[styles.stripExpandBtn, { backgroundColor: subView === 'chat' ? colors.primary : colors.surfaceAlt }]}
        >
          <Ionicons name="chatbubbles" size={15} color="#fff" />
          <Text style={styles.stripExpandText}>{subView === 'chat' ? 'Canais' : 'Chat'}</Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={enterFullscreen} style={styles.stripExpandBtn}>
          <Ionicons name="expand" size={16} color="#fff" />
          <Text style={styles.stripExpandText}>Ecrã Inteiro</Text>
        </Pressable>
      </View>

      {nowEpg ? (
        <View style={styles.stripEpgWrap}>
          <View style={styles.stripEpgLine}>
            <Text style={styles.stripEpgNowLabel}>AGORA</Text>
            <Text style={styles.stripEpgTime}>
              {formatTime(nowEpg.start)} - {formatTime(nowEpg.end)}
            </Text>
            <Text style={styles.stripEpgTitle} numberOfLines={1}>
              {nowEpg.title}
            </Text>
          </View>
          <View style={styles.epgBarBg}>
            <View style={[styles.epgBarFg, { width: `${epgProgress * 100}%` }]} />
          </View>
          {nextEpg && (
            <View style={styles.stripEpgLine}>
              <Text style={styles.stripEpgNextLabel}>SEGUINTE</Text>
              <Text style={styles.stripEpgTime}>{formatTime(nextEpg.start)}</Text>
              <Text style={styles.stripEpgNextTitle} numberOfLines={1}>
                {nextEpg.title}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <Text style={styles.stripNoEpg}>Toque no vídeo ou no canal ativo para abrir em ecrã inteiro</Text>
      )}
    </View>
  );

  // ---- Channel Row (MYTVOnline+ style) ----
  const renderChannelRow = ({ item }: { item: LiveChannel }) => {
    const isCurrent = item.id === selectedId;
    const fav = isFavorite('live', item.id);
    return (
      <Pressable
        onPress={() => onSelectChannel(item)}
        onLongPress={() => toggleFavorite({ kind: 'live', id: item.id, name: item.name, icon: item.icon })}
        style={({ pressed }) => [
          styles.channelRow,
          isCurrent && styles.channelRowActive,
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={[styles.activeAccent, isCurrent && { backgroundColor: colors.primary }]} />
        <Text style={[styles.chNum, isCurrent && { color: colors.primary, fontWeight: '800' }]}>
          {String(item.num ?? '').padStart(3, '0')}
        </Text>
        <View style={styles.chLogoBox}>
          {item.icon ? (
            <Image source={item.icon} style={styles.chLogoImg} contentFit="contain" recyclingKey={item.id} />
          ) : (
            <Ionicons name="tv-outline" size={20} color={colors.textMuted} />
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.chName, isCurrent && { color: '#fff', fontWeight: '700' }]} numberOfLines={1}>
            {item.name}
          </Text>
          {isCurrent && nowEpg ? (
            <Text style={styles.chSubEpg} numberOfLines={1}>
              ▶ {nowEpg.title}
            </Text>
          ) : null}
        </View>
        {isCurrent && (
          <View style={styles.playingPill}>
            <Ionicons name="radio" size={14} color="#fff" />
          </View>
        )}
        <Pressable
          hitSlop={10}
          onPress={() => toggleFavorite({ kind: 'live', id: item.id, name: item.name, icon: item.icon })}
        >
          <Ionicons name={fav ? 'star' : 'star-outline'} size={19} color={fav ? colors.accent : colors.textMuted} />
        </Pressable>
      </Pressable>
    );
  };

  // ---- Wide layout (Tablet / Landscape / Smart TV / TV Box) ----
  if (isWide) {
    return (
      <View style={styles.wideContainer}>
        {/* Column 1: Groups */}
        <View style={styles.wideGroupsCol}>
          <View style={styles.wideColHeader}>
            <Text style={styles.wideColTitle}>GRUPOS</Text>
            <IconButton name="refresh" size={18} onPress={reload} />
          </View>
          <FlatList
            data={categories}
            keyExtractor={(c) => c.id}
            renderItem={({ item: c }) => {
              const activeCat = c.id === categoryId;
              return (
                <Pressable
                  onPress={() => setCategoryId(c.id)}
                  style={[styles.wideCatRow, activeCat && styles.wideCatRowActive]}
                >
                  <Ionicons name={c.icon} size={17} color={activeCat ? '#fff' : colors.textMuted} />
                  <Text style={[styles.wideCatName, activeCat && { color: '#fff' }]} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={[styles.wideCatCount, activeCat && { color: '#fff' }]}>{c.count}</Text>
                </Pressable>
              );
            }}
          />
        </View>

        {/* Column 2: Channels */}
        <View style={styles.wideChannelsCol}>
          <View style={{ padding: 8 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Pesquisar canal..." />
          </View>
          <FlatList
            data={filteredChannels}
            keyExtractor={(i) => i.id}
            renderItem={renderChannelRow}
            initialNumToRender={20}
            maxToRenderPerBatch={30}
            windowSize={11}
            removeClippedSubviews
          />
        </View>

        {/* Column 3: Docked Player + EPG Details */}
        <View style={styles.widePreviewCol}>
          {playerBox}
          {infoStrip}
        </View>
      </View>
    );
  }

  // ---- Portrait Mobile MYTVOnline+ Layout ----
  return (
    <View style={styles.mobileContainer}>
      {/* Top Docked 16:9 Video Player */}
      {playerBox}
      {/* Current Channel & EPG Bar */}
      {infoStrip}

      {subView === 'chat' ? (
        <View style={{ flex: 1 }}>
          <CommunityChatView activeTab={activeTab} compact />
        </View>
      ) : (
        <>
          {/* Group Pills + Search */}
          <View style={styles.groupBar}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={categories}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ gap: 6, paddingHorizontal: 10, alignItems: 'center' }}
              renderItem={({ item: c }) => {
                const activeCat = c.id === categoryId;
                return (
                  <Pressable
                    onPress={() => setCategoryId(c.id)}
                    style={[styles.groupChip, activeCat && styles.groupChipActive]}
                  >
                    <Ionicons
                      name={c.icon}
                      size={14}
                      color={activeCat ? '#fff' : c.id === FAV ? colors.accent : colors.textMuted}
                    />
                    <Text style={[styles.groupChipText, activeCat && { color: '#fff' }]}>{c.name}</Text>
                    <Text style={[styles.groupChipCount, activeCat && { color: '#fffa' }]}>{c.count}</Text>
                  </Pressable>
                );
              }}
            />
          </View>

          <View style={{ paddingHorizontal: 10, paddingBottom: 6 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Pesquisar nos canais..." />
          </View>

          {/* Channel List */}
          <FlatList
            data={filteredChannels}
            keyExtractor={(i) => i.id}
            renderItem={renderChannelRow}
            initialNumToRender={18}
            maxToRenderPerBatch={25}
            windowSize={10}
            removeClippedSubviews
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <EmptyView
                message={
                  categoryId === FAV
                    ? 'Sem canais favoritos.\nToque na estrela para guardar canais.'
                    : 'Nenhum canal encontrado.'
                }
              />
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mobileContainer: { flex: 1, backgroundColor: colors.bg },
  dockedPlayerWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 230,
    backgroundColor: '#000',
    position: 'relative',
  },
  widePlayerWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    position: 'relative',
  },
  fsContainer: { flex: 1, backgroundColor: '#000' },
  fsPlayerWrap: { flex: 1, backgroundColor: '#000' },
  playerCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: '#0008',
  },
  adOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0B0C10EB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 40,
  },
  adCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: 8,
  },
  adBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  adTag: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  adTimerText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  adCloseBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  adCloseBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  adTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  adDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  adPlans: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  retryingText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  errorTitle: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  errorSub: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  dockedBadges: {
    position: 'absolute',
    top: 8,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#000b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ffffff22',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  liveBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  miniControlBtn: {
    backgroundColor: '#000b',
    padding: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ffffff22',
  },
  infoStrip: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  infoStripTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chNumPill: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chNumPillText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  infoChName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '800' },
  stripActionBtn: { padding: 4 },
  stripExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  stripExpandText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stripEpgWrap: { gap: 4 },
  stripEpgLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stripEpgNowLabel: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    width: 52,
  },
  stripEpgNextLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    width: 52,
  },
  stripEpgTime: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  stripEpgTitle: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '600' },
  stripEpgNextTitle: { flex: 1, color: colors.textMuted, fontSize: 12 },
  stripNoEpg: { color: colors.textMuted, fontSize: 11 },
  epgBarBg: { height: 3, borderRadius: 2, backgroundColor: '#ffffff1f', overflow: 'hidden' },
  epgBarFg: { height: 3, backgroundColor: colors.primary },
  groupBar: { paddingVertical: 8 },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  groupChipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  groupChipCount: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 12,
    height: 58,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  channelRowActive: { backgroundColor: colors.surface },
  activeAccent: { width: 4, alignSelf: 'stretch', backgroundColor: 'transparent' },
  chNum: { color: colors.textMuted, width: 32, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  chLogoBox: {
    width: 48,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chLogoImg: { width: 42, height: 30 },
  chName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  chSubEpg: { color: colors.primary, fontSize: 11, fontWeight: '600' },
  playingPill: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  // Wide / Tablet / TV layout
  wideContainer: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  wideGroupsCol: { width: 210, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.surface },
  wideColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  wideColTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  wideCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  wideCatRowActive: { backgroundColor: colors.primary },
  wideCatName: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
  wideCatCount: { color: colors.textMuted, fontSize: 11 },
  wideChannelsCol: { flex: 1.1, borderRightWidth: 1, borderRightColor: colors.border },
  widePreviewCol: { flex: 1.2, backgroundColor: colors.bg },
  // Fullscreen OSD
  lockFloating: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 10 },
  lockHint: { color: '#fff', fontSize: 13, fontWeight: '600', backgroundColor: '#000a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  fsTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 16,
    backgroundColor: '#0009',
  },
  osdCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#14161Ed9',
    borderWidth: 1,
    borderColor: '#ffffff22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  osdCircleBtnActive: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  osdPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    backgroundColor: '#14161Ed9',
    borderWidth: 1,
    borderColor: '#ffffff22',
  },
  osdPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  fsCenterControls: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
  },
  osdZapBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#14161Ed9',
    borderWidth: 1,
    borderColor: '#ffffff26',
    alignItems: 'center',
    justifyContent: 'center',
  },
  osdPlayBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsBottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#11131Be6',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#ffffff22',
    padding: 14,
    gap: 10,
  },
  fsChannelHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fsNumBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  fsNumText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  fsLogoBox: {
    width: 54,
    height: 38,
    borderRadius: 6,
    backgroundColor: '#1D202B',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fsLogo: { width: 48, height: 32 },
  fsChTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  fsPortalSub: { color: colors.textMuted, fontSize: 12 },
  fsEpgBox: { gap: 6 },
  fsEpgRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  epgTagNow: { backgroundColor: colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  epgTagText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  epgTagNext: { backgroundColor: '#ffffff1f', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  epgTagNextText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  fsEpgTime: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  fsEpgTitle: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '700' },
  fsEpgNextTitle: { flex: 1, color: '#cbd5e1', fontSize: 13 },
  noEpgText: { color: colors.textMuted, fontSize: 12 },
  // Fullscreen Drawer
  fsDrawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 440,
    maxWidth: '85%',
    backgroundColor: '#0B0C10f2',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    flexDirection: 'row',
  },
  fsDrawerCats: {
    width: 155,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  fsDrawerChannels: { flex: 1 },
  fsDrawerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 8,
  },
  fsDrawerHeader: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fsDrawerCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  fsDrawerCatActive: { backgroundColor: colors.primary },
  fsDrawerCatText: { flex: 1, color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  fsDrawerCatCount: { color: colors.textMuted, fontSize: 11 },
  fsDrawerChRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    height: 46,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fsDrawerChActive: { backgroundColor: '#E5091433' },
  fsDrawerChNum: { color: colors.textMuted, fontSize: 11, width: 26 },
  fsDrawerChLogo: { width: 34, height: 24 },
  fsDrawerChName: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  // Fullscreen row layout: TV on left, Fixed Chat on right
  fsMainLayout: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#000',
  },
  fsTvCol: {
    flex: 1,
    height: '100%',
    backgroundColor: '#000',
    flexDirection: 'column',
    position: 'relative',
  },
  fsTopBarLetterbox: {
    width: '100%',
    backgroundColor: '#080a10',
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff14',
    paddingHorizontal: 12,
    paddingVertical: 5,
    justifyContent: 'center',
    zIndex: 10,
  },
  fsTopBrandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fsTopChannelLogo: {
    width: 28,
    height: 18,
  },
  fsTopBrandBadge: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fsTopNumBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fsTopNumText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  fsTopChannelName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    maxWidth: 160,
  },
  fsTopEpgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff12',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fsTopEpgText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    maxWidth: 200,
  },
  fsVideoSurface: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fsBottomBarLetterbox: {
    width: '100%',
    backgroundColor: '#080a10',
    borderTopWidth: 1,
    borderTopColor: '#ffffff14',
    paddingHorizontal: 12,
    paddingVertical: 5,
    zIndex: 10,
  },
  fsBottomSponsorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#991B1Bdd', // Vermelho DaPortas / elegante
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ffffff2a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 8,
  },
  sponsorBadge: {
    backgroundColor: '#ffffff26',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sponsorBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sponsorLogo: {
    width: 20,
    height: 20,
  },
  sponsorMainText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  sponsorSubText: {
    color: '#fed7aa',
    fontSize: 9,
    fontWeight: '500',
  },
  // Fixed Full-height Chat Sidebar on the right
  fsChatColumnFixed: {
    width: 300,
    maxWidth: '42%',
    height: '100%',
    backgroundColor: '#0c0e14',
    borderLeftWidth: 1,
    borderLeftColor: '#ffffff1c',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 20,
  },
  fsChatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff14',
    gap: 8,
    backgroundColor: '#141824',
  },
  fsChatLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E50914',
  },
  fsChatTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
