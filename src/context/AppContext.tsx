import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { M3UProvider } from '../lib/m3u';
import type { ContentProvider, FavoriteItem, FavoriteKind, Playlist } from '../lib/types';
import { XtreamProvider } from '../lib/xtream';

const KEY_PLAYLISTS = 'bestiptv:playlists';
const KEY_ACTIVE = 'bestiptv:active';
const favKey = (id: string) => `bestiptv:fav:${id}`;

export function createProvider(p: Playlist): ContentProvider {
  return p.type === 'xtream' ? new XtreamProvider(p) : new M3UProvider(p);
}

interface AppState {
  ready: boolean;
  playlists: Playlist[];
  active: Playlist | null;
  provider: ContentProvider | null;
  favorites: FavoriteItem[];
  addPlaylist(p: Playlist): Promise<void>;
  updatePlaylist(p: Playlist): Promise<void>;
  removePlaylist(id: string): Promise<void>;
  selectPlaylist(id: string): Promise<void>;
  reload(): void;
  isFavorite(kind: FavoriteKind, id: string): boolean;
  toggleFavorite(item: FavoriteItem): void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [rawList, rawActive] = await Promise.all([
          AsyncStorage.getItem(KEY_PLAYLISTS),
          AsyncStorage.getItem(KEY_ACTIVE),
        ]);
        const list: Playlist[] = rawList ? JSON.parse(rawList) : [];
        setPlaylists(list);
        setActiveId(rawActive && list.some((p) => p.id === rawActive) ? rawActive : (list[0]?.id ?? null));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeId) {
      setFavorites([]);
      return;
    }
    AsyncStorage.getItem(favKey(activeId)).then((raw) => setFavorites(raw ? JSON.parse(raw) : []));
  }, [activeId]);

  const persist = useCallback(async (list: Playlist[]) => {
    setPlaylists(list);
    await AsyncStorage.setItem(KEY_PLAYLISTS, JSON.stringify(list));
  }, []);

  const selectPlaylist = useCallback(async (id: string) => {
    setActiveId(id);
    await AsyncStorage.setItem(KEY_ACTIVE, id);
  }, []);

  const addPlaylist = useCallback(
    async (p: Playlist) => {
      await persist([...playlists, p]);
      await selectPlaylist(p.id);
    },
    [playlists, persist, selectPlaylist],
  );

  const updatePlaylist = useCallback(
    async (p: Playlist) => {
      await persist(playlists.map((x) => (x.id === p.id ? p : x)));
      setReloadToken((t) => t + 1);
    },
    [playlists, persist],
  );

  const removePlaylist = useCallback(
    async (id: string) => {
      const list = playlists.filter((p) => p.id !== id);
      await persist(list);
      await AsyncStorage.removeItem(favKey(id));
      if (activeId === id) {
        const next = list[0]?.id ?? null;
        setActiveId(next);
        if (next) await AsyncStorage.setItem(KEY_ACTIVE, next);
        else await AsyncStorage.removeItem(KEY_ACTIVE);
      }
    },
    [playlists, persist, activeId],
  );

  const active = useMemo(() => playlists.find((p) => p.id === activeId) ?? null, [playlists, activeId]);

  const provider = useMemo(
    () => (active ? createProvider(active) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, reloadToken],
  );

  const isFavorite = useCallback(
    (kind: FavoriteKind, id: string) => favorites.some((f) => f.kind === kind && f.id === id),
    [favorites],
  );

  const toggleFavorite = useCallback(
    (item: FavoriteItem) => {
      if (!activeId) return;
      setFavorites((prev) => {
        const exists = prev.some((f) => f.kind === item.kind && f.id === item.id);
        const next = exists ? prev.filter((f) => !(f.kind === item.kind && f.id === item.id)) : [...prev, item];
        AsyncStorage.setItem(favKey(activeId), JSON.stringify(next));
        return next;
      });
    },
    [activeId],
  );

  const value: AppState = {
    ready,
    playlists,
    active,
    provider,
    favorites,
    addPlaylist,
    updatePlaylist,
    removePlaylist,
    selectPlaylist,
    reload: () => setReloadToken((t) => t + 1),
    isFavorite,
    toggleFavorite,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

