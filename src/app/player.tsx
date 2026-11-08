import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { filterByCategory } from '../components/ContentBrowser';
import { useApp } from '../context/AppContext';
import { useAsync } from '../hooks/useAsync';
import { sendPlayerHeartbeat } from '../lib/panel';
import type { EpgEntry, LiveChannel } from '../lib/types';
import { formatTime } from '../lib/utils';
import { colors } from '../theme';

type Params = { kind: 'live' | 'vod'; id?: string; categoryId?: string; url?: string; title?: string };

export default function Player() {
  const params = useLocalSearchParams<Params>();
  const { provider, active, favorites } = useApp();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

  const isLive = params.kind === 'live';
  const { data: allChannels } = useAsync(
    async () => (isLive && provider ? provider.getLiveChannels() : []),
    [provider, isLive],
  );
  const favSnapshot = useRef(favorites).current;
  const channels = useMemo(
    () => (allChannels ? filterByCategory(allChannels, params.categoryId ?? '__all', favSnapshot, 'live') : []),
    [allChannels, params.categoryId, favSnapshot],
  );
  const [index, setIndex] = useState(-1);
  useEffect(() => {
    if (channels.length && index === -1) setIndex(Math.max(0, channels.findIndex((c) => c.id === params.id)));
  }, [channels, index, params.id]);
  const channel: LiveChannel | undefined = isLive ? channels[index] : undefined;

  const uri = isLive ? channel?.url : params.url;
  const title = isLive ? (channel?.name ?? '') : (params.title ?? '');

  // ---- Player with connection-safe release & auto-retry ----
  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = false;
    p.showNowPlayingNotification = true;
  });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status, error: undefined });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const loadSeqRef = useRef(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(
    (isRetry = false) => {
      if (!uri) return;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (!isRetry) {
        retryCountRef.current = 0;
        setRetrying(false);
      }
      const seq = ++loadSeqRef.current;

      try {
        player.pause();
        player.replace(null);
      } catch {
        // ignore
      }

      retryTimerRef.current = setTimeout(() => {
        if (seq !== loadSeqRef.current) return;
        const contentType = uri.includes('.m3u8') ? ('hls' as const) : undefined;
        player
          .replaceAsync({ uri, contentType, headers: provider?.headers, metadata: { title } })
          .then(() => {
            if (seq === loadSeqRef.current) player.play();
          })
          .catch(() => {});
      }, 150);
    },
    [uri, player, provider, title],
  );

  useEffect(() => {
    load(false);
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      try {
        player.pause();
        player.replace(null);
      } catch {
        // ignore
      }
    };
  }, [load, player]);

  useEffect(() => {
    if (status === 'readyToPlay') {
      setRetrying(false);
      retryCountRef.current = 0;
      if (!player.playing) player.play();
    } else if (status === 'error' && uri) {
      if (retryCountRef.current < 3) {
        retryCountRef.current += 1;
        setRetrying(true);
        const seq = loadSeqRef.current;
        retryTimerRef.current = setTimeout(() => {
          if (seq === loadSeqRef.current) load(true);
        }, 900);
      } else {
        setRetrying(false);
      }
    }
  }, [status, uri, player, load]);

  useEffect(() => {
    if (!active || !title) return;
    sendPlayerHeartbeat({ playlist: active, channelName: title, playing: true });
    const interval = setInterval(() => {
      sendPlayerHeartbeat({ playlist: active, channelName: title, playing: true });
    }, 45000);
    return () => {
      clearInterval(interval);
      sendPlayerHeartbeat({ playlist: active, playing: false });
    };
  }, [active, title]);

  // ---- Overlay ----
  const [overlay, setOverlay] = useState(true);
  const [showList, setShowList] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpOverlay = useCallback(() => {
    setOverlay(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOverlay(false), 5000);
  }, []);
  useEffect(() => {
    bumpOverlay();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [bumpOverlay, index]);

  const zap = (delta: number) => {
    if (!channels.length) return;
    setIndex((i) => (i + delta + channels.length) % channels.length);
  };

  // ---- EPG ----
  const [epg, setEpg] = useState<EpgEntry[]>([]);
  useEffect(() => {
    setEpg([]);
    if (!channel || !provider) return;
    let alive = true;
    provider
      .getShortEpg(channel)
      .then((e) => alive && setEpg(e))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [channel, provider]);
  const now = epg[0];
  const next = epg[1];
  const progress = now ? Math.min(1, Math.max(0, (Date.now() - now.start) / (now.end - now.start))) : 0;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const pad = { paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) };

  const showSpinner = status === 'loading' || retrying || (status === 'idle' && !!uri);
  const showError = status === 'error' && !retrying;

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={!isLive}
        allowsPictureInPicture
      />

      {showSpinner && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
            {retrying ? `A reconectar (${retryCountRef.current}/3)...` : 'A carregar...'}
          </Text>
        </View>
      )}
      {showError && (
        <View style={styles.center}>
          <Ionicons name="warning-outline" size={42} color={colors.danger} />
          <Text style={styles.errorText}>Não foi possível reproduzir este conteúdo.</Text>
          {error?.message ? <Text style={styles.errorDetail}>{error.message}</Text> : null}
          <Pressable onPress={() => load(false)} style={styles.retry}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Tentar novamente</Text>
          </Pressable>
        </View>
      )}

      {isLive ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => (overlay ? setOverlay(false) : bumpOverlay())} />

          {overlay && (
            <>
              <View style={[styles.topBar, pad, { paddingTop: insets.top + 10 }]}>
                <CircleBtn icon="arrow-back" onPress={close} />
                {channel?.icon ? <Image source={channel.icon} style={styles.chLogo} contentFit="contain" /> : null}
                <Text style={styles.chTitle} numberOfLines={1}>
                  {channel?.num ? `${channel.num}. ` : ''}
                  {title}
                </Text>
                <CircleBtn icon="list" onPress={() => setShowList((v) => !v)} />
              </View>

              <View style={styles.centerControls} pointerEvents="box-none">
                <CircleBtn icon="play-skip-back" size={30} onPress={() => zap(-1)} />
                <CircleBtn
                  icon={isPlaying ? 'pause' : 'play'}
                  size={40}
                  onPress={() => {
                    if (isPlaying) player.pause();
                    else player.play();
                    bumpOverlay();
                  }}
                />
                <CircleBtn icon="play-skip-forward" size={30} onPress={() => zap(1)} />
              </View>

              <View style={[styles.bottomBar, pad, { paddingBottom: insets.bottom + 12 }]}>
                {now ? (
                  <>
                    <Text style={styles.epgNow} numberOfLines={1}>
                      <Text style={{ color: colors.primary }}>AGORA </Text>
                      {formatTime(now.start)} - {formatTime(now.end)} · {now.title}
                    </Text>
                    <View style={styles.progressBg}>
                      <View style={[styles.progressFg, { width: `${progress * 100}%` }]} />
                    </View>
                    {next && (
                      <Text style={styles.epgNext} numberOfLines={1}>
                        <Text style={{ color: colors.textMuted }}>A SEGUIR </Text>
                        {formatTime(next.start)} · {next.title}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.epgNext}>Sem informação de programação</Text>
                )}
              </View>
            </>
          )}

          {showList && (
            <View style={[styles.sidePanel, { paddingTop: insets.top + 10, paddingRight: insets.right }]}>
              <FlatList
                data={channels}
                keyExtractor={(c) => c.id}
                initialScrollIndex={index > 0 ? index : undefined}
                getItemLayout={(_, i) => ({ length: 52, offset: 52 * i, index: i })}
                renderItem={({ item, index: i }) => (
                  <Pressable
                    onPress={() => {
                      setIndex(i);
                      setShowList(false);
                    }}
                    style={[styles.sideRow, i === index && { backgroundColor: colors.primary }]}
                  >
                    {item.icon ? (
                      <Image source={item.icon} style={styles.sideLogo} contentFit="contain" recyclingKey={item.id} />
                    ) : (
                      <Ionicons name="tv-outline" size={18} color={colors.textMuted} style={{ width: 40 }} />
                    )}
                    <Text style={styles.sideText} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </Pressable>
                )}
              />
            </View>
          )}
        </>
      ) : (
        <View style={[styles.vodBack, { top: insets.top + 10, left: Math.max(insets.left, 16) }]}>
          <CircleBtn icon="arrow-back" onPress={close} />
        </View>
      )}
    </View>
  );
}

function CircleBtn({ icon, onPress, size = 22 }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; size?: number }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [styles.circle, { padding: size / 2.2, opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={size} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  errorText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  errorDetail: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  retry: { backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, marginTop: 6 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 20,
    backgroundColor: '#000a',
  },
  chLogo: { width: 48, height: 32 },
  chTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
  centerControls: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 16,
    gap: 6,
    backgroundColor: '#000b',
  },
  epgNow: { color: '#fff', fontSize: 15, fontWeight: '600' },
  epgNext: { color: '#ddd', fontSize: 13 },
  progressBg: { height: 4, borderRadius: 2, backgroundColor: '#ffffff33', overflow: 'hidden' },
  progressFg: { height: 4, backgroundColor: colors.primary },
  circle: { backgroundColor: '#0008', borderRadius: 999 },
  sidePanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 300,
    backgroundColor: '#0B0C10ee',
  },
  sideRow: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  sideLogo: { width: 40, height: 28 },
  sideText: { flex: 1, color: '#fff', fontSize: 14 },
  vodBack: { position: 'absolute' },
});
