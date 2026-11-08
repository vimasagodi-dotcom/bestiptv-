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
