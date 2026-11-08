import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { LiveFormat, Playlist, PlaylistType } from './types';
import { normalizeServer, parseXtreamM3uUrl, uid } from './utils';

const PANEL_API_URL = 'https://kikoiptv.vercel.app/api/panel';
const LOCAL_USERS_KEY = '@kikoiptv/panelUsers.v1';

export const SUBSCRIPTION_PLANS = [
  { years: 1, price: 5, label: '1 Ano', priceLabel: '5 €' },
  { years: 2, price: 9, label: '2 Anos', priceLabel: '9 €' },
  { years: 3, price: 13, label: '3 Anos', priceLabel: '13 €' },
  { years: 4, price: 16, label: '4 Anos', priceLabel: '16 €' },
  { years: 5, price: 19, label: '5 Anos', priceLabel: '19 €' },
] as const;

export interface PanelUserRecord {
  id: string;
  username: string;
  password: string;
  name: string;
  active: boolean;
  playlistType: PlaylistType;
  server?: string;
  xtreamUser?: string;
  xtreamPass?: string;
  m3uUrl?: string;
  liveFormat?: LiveFormat;
  planYears?: number;
  planPrice?: number;
  createdAt?: number;
  appExpDate?: number | null;
  lineExpDate?: number | null;
  lineStatus?: string;
  lineActiveCons?: number;
  lineMaxCons?: number;
  isOnline?: boolean;
  lastSeenAt?: number | null;
  currentChannel?: string | null;
  device?: string | null;
  updatedAt?: number;
}

export interface InspectedLineInfo {
  valid: boolean;
  status: string;
  expDate: number | null;
  activeCons: number;
  maxCons: number;
  server: string;
  username: string;
  password: string;
}

export function addYearsToDate(baseMs: number, years: number): number {
  const d = new Date(baseMs);
  d.setFullYear(d.getFullYear() + years);
  return d.getTime();
}

export async function getLocalPanelUsers(): Promise<PanelUserRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveLocalPanelUsers(users: PanelUserRecord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {
    // ignore
  }
}

/**
 * Inspects an M3U link or Xtream server+user+pass to automatically detect the line's expiration date.
 */
export async function inspectLineExpiration(params: {
  m3uUrl?: string;
  server?: string;
  xtreamUser?: string;
  xtreamPass?: string;
}): Promise<InspectedLineInfo> {
  const autoXt = parseXtreamM3uUrl(params.m3uUrl || '') || parseXtreamM3uUrl(params.server || '');
  const srv = normalizeServer(autoXt ? autoXt.server : params.server || '');
  const usr = (autoXt ? autoXt.username : params.xtreamUser || '').trim();
  const pwd = (autoXt ? autoXt.password : params.xtreamPass || '').trim();

  if (!srv || !usr || !pwd) {
    throw new Error('Cole o link M3U completo (com get.php?username=...) ou preencha Servidor, Utilizador e Password.');
  }

  // 1. Try direct Xtream player_api.php from device first (fastest)
  try {
    const apiUrl = `${srv}/player_api.php?username=${encodeURIComponent(usr)}&password=${encodeURIComponent(pwd)}`;
    const res = await fetch(apiUrl, { headers: { 'User-Agent': 'IPTVSmartersPlayer', Accept: '*/*' } });
    if (res.ok) {
      const data = await res.json();
      const u = data?.user_info;
      if (u && Number(u.auth) !== 0) {
        const expSec = u.exp_date ? Number(u.exp_date) : null;
        return {
          valid: true,
          status: String(u.status || 'Active'),
          expDate: expSec && !Number.isNaN(expSec) ? expSec * 1000 : null,
          activeCons: Number(u.active_cons ?? 0),
          maxCons: Number(u.max_connections ?? 1),
          server: srv,
          username: usr,
          password: pwd,
        };
      }
      if (u && Number(u.auth) === 0) {
        throw new Error('Utilizador ou password da linha IPTV inválidos.');
      }
    }
  } catch (e: any) {
    if (e?.message?.includes('inválidos')) throw e;
  }

  // 2. Fallback via Cloud Panel API
  const res = await fetch(PANEL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'inspect_line',
      m3uUrl: params.m3uUrl,
      server: srv,
      xtreamUser: usr,
      xtreamPass: pwd,
    }),
  });
  const data = await res.json();
  if (!data?.ok || !data.lineInfo) {
    throw new Error(data?.error || 'Não foi possível ler a data de expiração desta linha.');
  }
  return data.lineInfo;
}

/**
 * Sends a lightweight heartbeat so the Admin Panel knows if the user is online and which channel they are watching.
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
    await fetch(PANEL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'heartbeat',
        panelUsername,
        xtreamUser,
        channelName: opts.playing ? opts.channelName : null,
        playing: opts.playing,
        device: Platform.OS === 'ios' ? 'iPhone/iOS' : Platform.OS === 'android' ? 'Android/TV' : 'Web',
      }),
    });
  } catch {
    // Non-blocking
  }
}

/**
 * Logs in a client using the KikoIPTV Control Panel credentials (username + password).
 */
export async function loginWithPanelAccount(username: string, password: string): Promise<Playlist> {
  const usr = username.trim();
  const pwd = password.trim();
  if (!usr || !pwd) {
    throw new Error('Preencha o utilizador e a palavra-passe.');
  }

  try {
    const res = await fetch(PANEL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'client_login',
        username: usr,
        password: pwd,
        device: Platform.OS === 'ios' ? 'iPhone/iOS' : Platform.OS === 'android' ? 'Android/TV' : 'Web',
      }),
    });
    const data = await res.json();
    if (data?.ok && data.playlist) {
      const p = data.playlist;
      return {
        id: uid(),
        createdAt: Date.now(),
        name: p.name || `KikoIPTV (${usr})`,
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
    if (res.status === 401 || res.status === 403) {
      const localMatch = await findLocalUser(usr, pwd);
      if (localMatch) return localMatch;
      throw new Error(data?.error || 'Utilizador ou palavra-passe inválidos no Painel KikoIPTV.');
    }
  } catch (err: any) {
    if (err?.message?.includes('Painel') || err?.message?.includes('expirou')) throw err;
  }

  const localMatch = await findLocalUser(usr, pwd);
  if (localMatch) return localMatch;

  throw new Error('Utilizador ou palavra-passe não encontrados no Painel de Controlo.');
}

async function findLocalUser(usr: string, pwd: string): Promise<Playlist | null> {
  const list = await getLocalPanelUsers();
  const found = list.find(
    (u) => u.username.trim().toLowerCase() === usr.toLowerCase() && u.password.trim() === pwd,
  );
  if (!found) return null;
  if (found.active === false) {
    throw new Error('Esta conta encontra-se suspensa no Painel de Controlo.');
  }
  if (found.appExpDate && Date.now() > found.appExpDate) {
    throw new Error('A validade deste login KikoIPTV expirou.');
  }
  const xt = parseXtreamM3uUrl(found.m3uUrl || found.server || '');
  if (found.playlistType === 'xtream' || xt) {
    return {
      id: uid(),
      createdAt: Date.now(),
      name: found.name || `KikoIPTV (${found.username})`,
      type: 'xtream',
      server: xt ? xt.server : normalizeServer(found.server || ''),
      username: xt ? xt.username : (found.xtreamUser || '').trim(),
      password: xt ? xt.password : (found.xtreamPass || '').trim(),
      liveFormat: found.liveFormat ?? 'm3u8',
      panelUsername: found.username,
      appExpDate: found.appExpDate ?? null,
      planYears: found.planYears ?? 1,
      planPrice: found.planPrice ?? 5,
    };
  }
  return {
    id: uid(),
    createdAt: Date.now(),
    name: found.name || `KikoIPTV (${found.username})`,
    type: 'm3u',
    url: (found.m3uUrl || '').trim(),
    liveFormat: found.liveFormat ?? 'm3u8',
    panelUsername: found.username,
    appExpDate: found.appExpDate ?? null,
    planYears: found.planYears ?? 1,
    planPrice: found.planPrice ?? 5,
  };
}

export async function adminFetchUsers(adminPassword: string): Promise<PanelUserRecord[]> {
  const res = await fetch(PANEL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'admin_list', adminPassword: adminPassword.trim() }),
  });
  const data = await res.json();
  if (!data?.ok) throw new Error(data?.error || 'Password de administrador incorreta.');
  await saveLocalPanelUsers(data.users || []);
  return data.users || [];
}

export async function adminSaveUser(
  adminPassword: string,
  user: Partial<PanelUserRecord> & { renewFromNow?: boolean },
): Promise<PanelUserRecord[]> {
  const res = await fetch(PANEL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'admin_save_user', adminPassword: adminPassword.trim(), user }),
  });
  const data = await res.json();
  if (!data?.ok) throw new Error(data?.error || 'Erro ao guardar no Painel de Controlo.');
  await saveLocalPanelUsers(data.users || []);
  return data.users || [];
}

export async function adminDeleteUser(adminPassword: string, id: string): Promise<PanelUserRecord[]> {
  const res = await fetch(PANEL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'admin_delete_user', adminPassword: adminPassword.trim(), id }),
  });
  const data = await res.json();
  if (!data?.ok) throw new Error(data?.error || 'Erro ao eliminar utilizador.');
  await saveLocalPanelUsers(data.users || []);
  return data.users || [];
}
