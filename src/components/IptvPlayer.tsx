import { requireOptionalNativeModule, useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { LibVlcPlayerViewProps, LibVlcPlayerViewRef } from 'expo-libvlc-player';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { resolveStreamAttempt, resolveVlcStreamAttempt } from '../lib/utils';

export type IptvPlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface IptvPlayerState {
  status: IptvPlayerStatus;
  isPlaying: boolean;
  retrying: boolean;
  attempt: number;
  maxAttempts: number;
  errorMessage?: string;
  engine: 'libvlc' | 'expo-video';
  timeMs?: number;
  durationMs?: number;
}

export interface IptvPlayerRef {
  play: () => void;
  pause: () => void;
  reload: (startAttempt?: number) => void;
  seek: (timeMs: number) => void;
}

export interface IptvPlayerProps {
  uri?: string | null;
  title?: string;
  headers?: Record<string, string>;
  isLive?: boolean;
  active?: boolean;
  contentFit?: 'contain' | 'cover';
  muted?: boolean;
  nativeControls?: boolean;
  allowsPictureInPicture?: boolean;
  style?: StyleProp<ViewStyle>;
  onStatusChange?: (state: IptvPlayerState) => void;
}

const MAX_ATTEMPTS = 3;

export const IS_LIBVLC_AVAILABLE =
  Platform.OS !== 'web' && !!requireOptionalNativeModule('ExpoLibVlcPlayer');

type LibVlcViewComponent = (props: LibVlcPlayerViewProps) => React.JSX.Element;

let CachedLibVlcView: LibVlcViewComponent | null = null;
function getLibVlcView(): LibVlcViewComponent | null {
  if (!IS_LIBVLC_AVAILABLE) return null;
  if (!CachedLibVlcView) {
    // Dynamic require prevents crashes in Expo Go / Web where native ExpoLibVlcPlayer is absent
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-libvlc-player');
    CachedLibVlcView = mod.LibVlcPlayerView ?? null;
  }
  return CachedLibVlcView;
}

/**
 * LibVLC (FFmpeg + Hardware Decode) engine — equivalent to MYTVOnline / VLC / TiviMate.
 * Natively plays raw MPEG-TS (.ts), HLS (.m3u8), MKV, H.265/HEVC, MPEG-2, AC3/E-AC3/MP2/DTS
 * on both Android and iOS.
 */
const LibVlcEngine = forwardRef<IptvPlayerRef, IptvPlayerProps>(function LibVlcEngine(
  {
    uri,
    title,
    headers,
    isLive = true,
    active = true,
    contentFit = 'contain',
    muted = false,
    allowsPictureInPicture = true,
    style,
    onStatusChange,
  },
  ref,
) {
  const LibVlcPlayerView = getLibVlcView();
  const vlcRef = useRef<LibVlcPlayerViewRef>(null);

  const [attempt, setAttempt] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [activeSource, setActiveSource] = useState<{ uri: string; options: string[] } | null>(null);
  const [status, setStatus] = useState<IptvPlayerStatus>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [timeMs, setTimeMs] = useState<number>(0);
  const [durationMs, setDurationMs] = useState<number>(0);

  const loadSeqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerLoad = useCallback(
    (nextAttempt: number) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const seq = ++loadSeqRef.current;

      if (!uri || !active) {
        setActiveSource(null);
        setStatus('idle');
        setIsPlaying(false);
        setErrorMessage(undefined);
        return;
      }

      // Release previous socket cleanly for single-connection Xtream panels
      setActiveSource(null);
      setAttempt(nextAttempt);
      setStatus('loading');
      setIsPlaying(false);
      setErrorMessage(undefined);

      const delay = nextAttempt === 0 ? 180 : 600;
      timerRef.current = setTimeout(() => {
        if (loadSeqRef.current !== seq) return;
        const resolved = resolveVlcStreamAttempt(uri, nextAttempt, headers, isLive);
        setActiveSource({ uri: resolved.uri, options: resolved.options });
      }, delay);
    },
    [uri, active, headers, isLive],
  );

  // Trigger fresh load when uri, active, or explicit reload changes
  useEffect(() => {
    triggerLoad(0);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [uri, active, reloadNonce, triggerLoad]);

  // Watchdog: if stuck loading for >7s, advance to next format / User-Agent / SW decoder
  useEffect(() => {
    if (status !== 'loading' || !uri || !active || attempt >= MAX_ATTEMPTS) return;
    const t = setTimeout(() => {
      triggerLoad(attempt + 1);
    }, 7000);
    return () => clearTimeout(t);
  }, [status, uri, active, attempt, triggerLoad]);

  // Report unified state up to parent
  useEffect(() => {
    onStatusChange?.({
      status,
      isPlaying,
      retrying: status === 'loading' && attempt > 0,
      attempt,
      maxAttempts: MAX_ATTEMPTS,
      errorMessage,
      engine: 'libvlc',
      timeMs,
      durationMs,
    });
  }, [status, isPlaying, attempt, errorMessage, timeMs, durationMs, onStatusChange]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        vlcRef.current?.play().catch(() => {});
      },
      pause: () => {
        vlcRef.current?.pause().catch(() => {});
      },
      reload: (startAttempt = 0) => {
        if (startAttempt === 0) {
          setReloadNonce((n) => n + 1);
        } else {
          triggerLoad(startAttempt);
        }
      },
      seek: (ms: number) => {
        vlcRef.current?.seek(ms, 'time').catch(() => {});
      },
    }),
    [triggerLoad],
  );

  const metadata = useMemo(() => (title ? { title } : undefined), [title]);

  if (!LibVlcPlayerView) return null;

  return (
    <LibVlcPlayerView
      ref={vlcRef}
      style={[StyleSheet.absoluteFill, style]}
      source={activeSource?.uri ?? null}
      options={activeSource?.options}
      metadata={metadata}
      contentFit={contentFit}
      mute={muted}
      autoplay
      keepScreenAwake
      playInBackground={false}
      pictureInPicture={allowsPictureInPicture}
      onFirstPlay={(info) => {
        setStatus('playing');
        setIsPlaying(true);
        setErrorMessage(undefined);
        if (info?.media?.length) setDurationMs(info.media.length);
      }}
      onPlaying={() => {
        setStatus('playing');
        setIsPlaying(true);
        setErrorMessage(undefined);
      }}
      onPaused={() => {
        setStatus('paused');
        setIsPlaying(false);
      }}
      onStopped={() => {
        setIsPlaying(false);
      }}
      onBuffering={(e) => {
        if (e.value >= 0.99) {
          setStatus('playing');
        }
      }}
      onTimeChanged={(e) => {
        if (typeof e?.value === 'number') setTimeMs(e.value);
      }}
      onEncounteredError={(e) => {
        const msg = e?.message || 'Erro ao abrir stream';
        if (attempt < MAX_ATTEMPTS && uri && active) {
          triggerLoad(attempt + 1);
        } else {
          setStatus('error');
          setIsPlaying(false);
          setErrorMessage(msg);
        }
      }}
    />
  );
});

/**
 * Fallback engine using expo-video (for Expo Go & Web where native LibVLC isn't linked).
 */
const ExpoVideoEngine = forwardRef<IptvPlayerRef, IptvPlayerProps>(function ExpoVideoEngine(
  {
    uri,
    title,
    headers,
    active = true,
    contentFit = 'contain',
    muted = false,
    nativeControls = false,
    allowsPictureInPicture = true,
    style,
    onStatusChange,
  },
  ref,
) {
  const player = useVideoPlayer(null, (p) => {
    p.staysActiveInBackground = false;
    p.showNowPlayingNotification = true;
  });
  const { status: rawStatus, error } = useEvent(player, 'statusChange', {
    status: player.status,
    error: undefined,
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const [attempt, setAttempt] = useState(0);
  const loadSeqRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      player.muted = muted;
    } catch {}
  }, [player, muted]);

  const load = useCallback(
    (nextAttempt = 0) => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      const seq = ++loadSeqRef.current;

      if (!uri || !active) {
        try {
          player.pause();
          player.replace(null);
        } catch {}
        return;
      }

      setAttempt(nextAttempt);
      try {
        player.pause();
        player.replace(null);
      } catch {}

      const delay = nextAttempt === 0 ? 220 : 650;
      retryTimerRef.current = setTimeout(() => {
        if (loadSeqRef.current !== seq) return;
        const resolved = resolveStreamAttempt(uri, nextAttempt, headers, Platform.OS === 'ios');
        player
          .replaceAsync({
            uri: resolved.uri,
            contentType: resolved.contentType,
            headers: resolved.headers,
            metadata: { title: title ?? '' },
          })
          .then(() => {
            if (loadSeqRef.current === seq) player.play();
          })
          .catch(() => {
            if (loadSeqRef.current === seq && nextAttempt < MAX_ATTEMPTS) {
              load(nextAttempt + 1);
            }
          });
      }, delay);
    },
    [uri, active, headers, title, player],
  );

  useEffect(() => {
    load(0);
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      try {
        player.pause();
        player.replace(null);
      } catch {}
    };
  }, [load, player]);

  useEffect(() => {
    if (rawStatus === 'readyToPlay' && active && uri) {
      if (!player.playing) {
        try {
          player.play();
        } catch {}
      }
    } else if (rawStatus === 'error' && active && uri && attempt < MAX_ATTEMPTS) {
      load(attempt + 1);
    }
  }, [rawStatus, active, uri, attempt, player, load]);

  useEffect(() => {
    if (rawStatus !== 'loading' || !active || !uri || attempt >= MAX_ATTEMPTS) return;
    const t = setTimeout(() => load(attempt + 1), 4500);
    return () => clearTimeout(t);
  }, [rawStatus, active, uri, attempt, load]);

  useEffect(() => {
    const mappedStatus: IptvPlayerStatus =
      !uri || !active
        ? 'idle'
        : rawStatus === 'readyToPlay'
          ? isPlaying
            ? 'playing'
            : 'paused'
          : rawStatus === 'error' && attempt >= MAX_ATTEMPTS
            ? 'error'
            : 'loading';

    onStatusChange?.({
      status: mappedStatus,
      isPlaying,
      retrying: mappedStatus === 'loading' && attempt > 0,
      attempt,
      maxAttempts: MAX_ATTEMPTS,
      errorMessage: error?.message,
      engine: 'expo-video',
    });
  }, [rawStatus, isPlaying, attempt, error, uri, active, onStatusChange]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        try {
          player.play();
        } catch {}
      },
      pause: () => {
        try {
          player.pause();
        } catch {}
      },
      reload: (startAttempt = 0) => load(startAttempt),
      seek: (ms: number) => {
        try {
          player.currentTime = ms / 1000;
        } catch {}
      },
    }),
    [player, load],
  );

  return (
    <VideoView
      player={player}
      style={[StyleSheet.absoluteFill, style]}
      contentFit={contentFit}
      nativeControls={nativeControls}
      allowsPictureInPicture={allowsPictureInPicture}
    />
  );
});

export const IptvPlayer = forwardRef<IptvPlayerRef, IptvPlayerProps>(function IptvPlayer(props, ref) {
  if (IS_LIBVLC_AVAILABLE) {
    return <LibVlcEngine ref={ref} {...props} />;
  }
  return <ExpoVideoEngine ref={ref} {...props} />;
});
