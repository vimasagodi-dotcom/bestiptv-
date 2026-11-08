import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LiveFormat, Playlist, PlaylistType } from './types';
import { normalizeServer, parseXtreamM3uUrl, uid } from './utils';

const PANEL_API_URL = 'https://kikoiptv.vercel.app/api/panel';
const LOCAL_USERS_KEY = '@kikoiptv/panelUsers.v1';

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
  updatedAt?: number;
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
 * Logs in a client using the KikoIPTV Control Panel credentials (username + password).
 * Queries the cloud Control Panel first, falling back to locally stored panel users.
 */
export async function loginWithPanelAccount(username: string, password: string): Promise<Playlist> {
  const usr = username.trim();
  const pwd = password.trim();
  if (!usr || !pwd) {
    throw new Error('Preencha o utilizador e a palavra-passe.');
  }

  // 1. Try Cloud Control Panel API first
  try {
    const res = await fetch(PANEL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'client_login', username: usr, password: pwd }),
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
      };
    }
    if (res.status === 401 || res.status === 403) {
      // Check local panel users before failing in case user created it locally on this device
      const localMatch = await findLocalUser(usr, pwd);
      if (localMatch) return localMatch;
      throw new Error(data?.error || 'Utilizador ou palavra-passe inválidos no Painel KikoIPTV.');
    }
  } catch (err: any) {
    if (err?.message?.includes('Painel')) throw err;
  }

  // 2. Fallback to locally saved panel users
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
    };
  }
  return {
    id: uid(),
    createdAt: Date.now(),
    name: found.name || `KikoIPTV (${found.username})`,
    type: 'm3u',
    url: (found.m3uUrl || '').trim(),
    liveFormat: found.liveFormat ?? 'm3u8',
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

export async function adminSaveUser(adminPassword: string, user: Partial<PanelUserRecord>): Promise<PanelUserRecord[]> {
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

