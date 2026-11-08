import { Platform } from 'react-native';

import type { Playlist } from './types';
import { normalizeServer, uid } from './utils';

const PANEL_API_URLS = [
  'https://iptvcocas.vercel.app/api/panel',
  'https://www.cocas.online/api/panel',
];

export async function callPanelApi(payload: Record<string, any>): Promise<any> {
  let lastErr: any = null;
  for (const url of PANEL_API_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok || res.status === 400 || res.status === 401 || res.status === 403) {
        return await res.json();
      }
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('Não foi possível ligar ao servidor Cocas.');
}

/**
 * Sends a lightweight heartbeat so the server knows if the user is online and which channel they are watching.
 */
export async function sendPlayerHeartbeat(opts: {
  playlist?: Playlist | null;
  channelName?: string | null;
  playing: boolean;
}): Promise<void> {
  const p = opts.playlist;
  if (!p) return;
  const panelUsername = p.panelUsername || '';
  const xtreamUser = p.username || '';
  if (!panelUsername && !xtreamUser) return;

  try {
    await callPanelApi({
      action: 'heartbeat',
      panelUsername,
      xtreamUser,
      channelName: opts.playing ? opts.channelName : null,
      playing: opts.playing,
      device: Platform.OS === 'ios' ? 'iPhone/iOS' : Platform.OS === 'android' ? 'Android/TV' : 'Web',
    });
  } catch {
    // Non-blocking
  }
}

/**
 * Logs in a client using their Cocas account credentials (username + password).
 */
export async function loginWithPanelAccount(username: string, password: string): Promise<Playlist> {
  const usr = username.trim();
  const pwd = password.trim();
  if (!usr || !pwd) {
    throw new Error('Preencha o utilizador e a palavra-passe.');
  }

  const data = await callPanelApi({
    action: 'client_login',
    username: usr,
    password: pwd,
    device: Platform.OS === 'ios' ? 'iPhone/iOS' : Platform.OS === 'android' ? 'Android/TV' : 'Web',
  });
  if (data?.ok && data.playlist) {
    const p = data.playlist;
    return {
      id: uid(),
      createdAt: Date.now(),
      name: p.name || `Cocas (${usr})`,
      type: p.type === 'm3u' ? 'm3u' : 'xtream',
      server: p.server ? normalizeServer(p.server) : undefined,
      username: p.username?.trim(),
      password: p.password?.trim(),
      url: p.url?.trim(),
      liveFormat: p.liveFormat ?? 'm3u8',
      panelUsername: p.panelUsername || usr,
      appExpDate: p.appExpDate ?? null,
      planYears: p.planYears ?? 1,
      planPrice: p.planPrice ?? 5,
    };
  }

  throw new Error(data?.error || 'Utilizador ou palavra-passe inválidos.');
}
