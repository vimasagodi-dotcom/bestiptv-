const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decodes base64 (UTF-8 aware). Returns the input unchanged if it is not valid base64. */
export function decodeBase64(input?: string | null): string {
  if (!input) return '';
  const str = input.replace(/[^A-Za-z0-9+/]/g, '');
  if (str.length === 0 || str.length % 4 === 1) return input;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of str) {
    buffer = (buffer << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  // UTF-8 decode
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b >= 0xc0 && b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f));
    else if (b >= 0xe0 && b < 0xf0)
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f));
    else if (b >= 0xf0) {
      const cp =
        ((b & 0x07) << 18) | ((bytes[++i] & 0x3f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f);
      out += String.fromCodePoint(cp);
    }
  }
  return out;
}

export function normalizeServer(server: string): string {
  let s = server.trim().replace(/\s+/g, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  // Strip common portal suffixes if the user pasted a full portal/API path
  s = s.replace(/\/(c|player_api\.php|panel_api\.php|get\.php|xmltv\.php)(\?.*)?$/i, '');
  s = s.replace(/\/+$/, '');
  return s;
}

export function query(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

export function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Detects an Xtream Codes M3U link (get.php?username=..&password=..), even if http:// was omitted */
export function parseXtreamM3uUrl(url: string): { server: string; username: string; password: string } | null {
  let u = url.trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u) && /\/get\.php\?/i.test(u)) {
    u = `http://${u}`;
  }
  const m = u.match(/^(https?:\/\/[^/\s]+)\/get\.php\?(.*)$/i);
  if (!m) return null;
  const params: Record<string, string> = {};
  for (const part of m[2].split('&')) {
    const [k, v = ''] = part.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  if (!params.username || !params.password) return null;
  return {
    server: m[1].trim(),
    username: params.username.trim(),
    password: params.password.trim(),
  };
}

const XTREAM_LIVE_RE = /^(https?:\/\/[^/\s]+)(?:\/live)?\/([^/\s]+)\/([^/\s]+)\/(\d+)(?:\.(m3u8|ts))?(\?.*)?$/i;

const FALLBACK_USER_AGENTS = [
  'IPTVSmartersPlayer',
  'VLC/3.0.20 LibVLC/3.0.20',
  'TiviMate/4.7.0 (Linux; Android 12)',
  'Lavf/60.3.100',
];

export interface ResolvedStreamAttempt {
  uri: string;
  contentType?: 'hls';
  headers?: Record<string, string>;
  label: string;
}

/**
 * Builds intelligent fallback stream candidates across attempts (0..3).
 * Rotates between HLS (.m3u8), MPEG-TS (.ts), direct Xtream stream URLs,
 * and industry-standard IPTV User-Agents so channels open reliably on Android, iOS & Smart TV.
 */
export function resolveStreamAttempt(
  rawUrl: string,
  attempt: number,
  baseHeaders?: Record<string, string>,
  isIos = false,
): ResolvedStreamAttempt {
  const cleanUrl = rawUrl.trim();
  const ua = FALLBACK_USER_AGENTS[attempt % FALLBACK_USER_AGENTS.length];
  const headers: Record<string, string> = {
    Accept: '*/*',
    ...(baseHeaders || {}),
    'User-Agent': attempt === 0 && baseHeaders?.['User-Agent'] ? baseHeaders['User-Agent'] : ua,
  };

  const m = cleanUrl.match(XTREAM_LIVE_RE);
  if (m) {
    const [, origin, user, pass, streamId, , qs = ''] = m;
    const hlsUrl = `${origin}/live/${user}/${pass}/${streamId}.m3u8${qs}`;
    const tsLiveUrl = `${origin}/live/${user}/${pass}/${streamId}.ts${qs}`;
    const tsDirectUrl = `${origin}/${user}/${pass}/${streamId}${qs}`;

    if (isIos) {
      // iOS AVPlayer requires HLS (.m3u8) for live streams; fallback to raw only on later attempts
      if (attempt === 0) return { uri: hlsUrl, contentType: 'hls', headers, label: 'HLS (.m3u8)' };
      if (attempt === 1) return { uri: hlsUrl, contentType: 'hls', headers, label: 'HLS (VLC UA)' };
      if (attempt === 2) return { uri: cleanUrl, contentType: undefined, headers, label: 'Direct Stream' };
      return { uri: tsDirectUrl, contentType: undefined, headers, label: 'Raw Stream' };
    }

    // Android & Smart TV (ExoPlayer):
    // Attempt 0: HLS (.m3u8) -> Attempt 1: MPEG-TS (.ts) -> Attempt 2: Direct (/user/pass/id) -> Attempt 3: Auto-sniff HLS
    if (attempt === 0) return { uri: hlsUrl, contentType: 'hls', headers, label: 'HLS (.m3u8)' };
    if (attempt === 1) return { uri: tsLiveUrl, contentType: undefined, headers, label: 'MPEG-TS (.ts)' };
    if (attempt === 2) return { uri: tsDirectUrl, contentType: undefined, headers, label: 'Direct TS' };
    return { uri: hlsUrl, contentType: undefined, headers, label: 'Auto-Detect' };
  }

  // Non-Xtream URLs (custom M3U links, CDN streams, VOD files)
  const looksLikeHls = /\.m3u8($|\?)/i.test(cleanUrl) || /extension=m3u8|output=m3u8|type=m3u8/i.test(cleanUrl);
  const isVodFile = /\.(mp4|mkv|avi|mov|wmv|flv|m4v)($|\?)/i.test(cleanUrl);

  if (isVodFile) {
    return {
      uri: cleanUrl,
      contentType: undefined,
      headers: attempt === 3 ? undefined : headers,
      label: `VOD (${attempt + 1})`,
    };
  }

  if (attempt === 0) {
    return {
      uri: cleanUrl,
      contentType: looksLikeHls ? 'hls' : undefined,
      headers,
      label: looksLikeHls ? 'HLS' : 'Stream',
    };
  }
  if (attempt === 1) {
    // Flip contentType hint in case an extensionless URL is actually HLS (or vice-versa)
    return {
      uri: cleanUrl,
      contentType: looksLikeHls ? undefined : 'hls',
      headers,
      label: looksLikeHls ? 'Auto-Sniff' : 'Force HLS',
    };
  }
  if (attempt === 2) {
    return {
      uri: cleanUrl,
      contentType: undefined,
      headers,
      label: 'TiviMate UA',
    };
  }
  return {
    uri: cleanUrl,
    contentType: undefined,
    headers: undefined,
    label: 'Direct No-Headers',
  };
}
