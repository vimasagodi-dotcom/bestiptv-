import type {
  AccountInfo,
  Category,
  ContentProvider,
  Episode,
  EpgEntry,
  LiveChannel,
  Movie,
  MovieInfo,
  Playlist,
  Series,
  SeriesInfo,
} from './types';
import { decodeBase64, normalizeServer, query } from './utils';

const str = (v: unknown): string | undefined =>
  v === null || v === undefined || v === '' ? undefined : String(v);

function firstOf(v: unknown): string | undefined {
  if (Array.isArray(v)) return str(v[0]);
  return str(v);
}

export class XtreamProvider implements ContentProvider {
  private base: string;
  private user: string;
  private pass: string;
  private liveExt: string;
  private cache = new Map<string, Promise<any>>();
  headers?: Record<string, string>;

  constructor(playlist: Playlist) {
    this.base = normalizeServer(playlist.server ?? '');
    this.user = (playlist.username ?? '').trim();
    this.pass = (playlist.password ?? '').trim();
    this.liveExt = playlist.liveFormat ?? 'm3u8';
    this.headers = {
      'User-Agent': playlist.userAgent?.trim() || 'IPTVSmartersPlayer',
      Accept: '*/*',
    };
  }

  private async api(action?: string, extra: Record<string, string> = {}): Promise<any> {
    const url = `${this.base}/player_api.php?${query({
      username: this.user,
      password: this.pass,
      action,
      ...extra,
    })}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        res = await fetch(url, {
          headers: { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20', Accept: '*/*' },
        });
      }
    } catch {
      // Retry without custom headers if CORS/network rejects custom headers
      res = await fetch(url);
    }
    if (!res.ok) throw new Error(`Erro do servidor (HTTP ${res.status})`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Resposta inválida do servidor Xtream. Verifique o URL do servidor.');
    }
  }

  private cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (!this.cache.has(key)) {
      const p = fn().catch((e) => {
        this.cache.delete(key);
        throw e;
      });
      this.cache.set(key, p);
    }
    return this.cache.get(key)!;
  }

  /** Validates credentials. Throws if the login fails. */
  async authenticate(): Promise<AccountInfo> {
    const data = await this.api();
    if (!data?.user_info || Number(data.user_info.auth) === 0) {
      throw new Error('Utilizador ou palavra-passe inválidos');
    }
    return this.mapAccount(data.user_info);
  }

  private mapAccount(u: any): AccountInfo {
    return {
      status: str(u.status),
      expDate: u.exp_date ? Number(u.exp_date) * 1000 : null,
      maxConnections: str(u.max_connections),
      activeConnections: str(u.active_cons),
    };
  }

  getAccountInfo(): Promise<AccountInfo | null> {
    return this.cached('account', async () => {
      const data = await this.api();
      return data?.user_info ? this.mapAccount(data.user_info) : null;
    });
  }

  private mapCategories(list: any): Category[] {
    if (!Array.isArray(list)) return [];
    return list.map((c) => ({ id: String(c.category_id), name: String(c.category_name ?? '') }));
  }

  getLiveCategories() {
    return this.cached('liveCats', async () => this.mapCategories(await this.api('get_live_categories')));
  }

  getMovieCategories() {
    return this.cached('vodCats', async () => this.mapCategories(await this.api('get_vod_categories')));
  }

  getSeriesCategories() {
    return this.cached('seriesCats', async () => this.mapCategories(await this.api('get_series_categories')));
  }

  liveUrl(id: string) {
    return `${this.base}/live/${this.user}/${this.pass}/${id}.${this.liveExt}`;
  }

  getLiveChannels(): Promise<LiveChannel[]> {
    return this.cached('live', async () => {
      const list = await this.api('get_live_streams');
      if (!Array.isArray(list)) return [];
      return list.map((s: any) => ({
        id: String(s.stream_id),
        name: String(s.name ?? ''),
        icon: str(s.stream_icon),
        categoryId: String(s.category_id ?? ''),
        num: s.num ? Number(s.num) : undefined,
        epgId: str(s.epg_channel_id),
        url: this.liveUrl(String(s.stream_id)),
      }));
    });
  }

  getMovies(): Promise<Movie[]> {
    return this.cached('vod', async () => {
      const list = await this.api('get_vod_streams');
      if (!Array.isArray(list)) return [];
      return list.map((s: any) => ({
        id: String(s.stream_id),
        name: String(s.name ?? ''),
        icon: str(s.stream_icon),
        categoryId: String(s.category_id ?? ''),
        rating: str(s.rating),
        extension: str(s.container_extension) ?? 'mp4',
      }));
    });
  }

  getSeries(): Promise<Series[]> {
    return this.cached('series', async () => {
      const list = await this.api('get_series');
      if (!Array.isArray(list)) return [];
      return list.map((s: any) => ({
        id: String(s.series_id),
        name: String(s.name ?? ''),
        icon: str(s.cover),
        categoryId: String(s.category_id ?? ''),
        rating: str(s.rating),
        plot: str(s.plot),
      }));
    });
  }

  async getMovieInfo(id: string): Promise<MovieInfo> {
    const data = await this.api('get_vod_info', { vod_id: id });
    const info = data?.info ?? {};
    const md = data?.movie_data ?? {};
    const movies = await this.getMovies().catch(() => [] as Movie[]);
    const fallback = movies.find((m) => m.id === id);
    const ext = str(md.container_extension) ?? fallback?.extension ?? 'mp4';
    return {
      name: str(md.name) ?? str(info.name) ?? fallback?.name ?? '',
      icon: str(info.movie_image) ?? str(info.cover_big) ?? fallback?.icon,
      backdrop: firstOf(info.backdrop_path),
      plot: str(info.plot) ?? str(info.description),
      cast: str(info.cast) ?? str(info.actors),
      director: str(info.director),
      genre: str(info.genre),
      releaseDate: str(info.releasedate) ?? str(info.release_date),
      duration: str(info.duration),
      rating: str(info.rating) ?? fallback?.rating,
      url: `${this.base}/movie/${this.user}/${this.pass}/${id}.${ext}`,
    };
  }

  async getSeriesInfo(id: string): Promise<SeriesInfo> {
    const data = await this.api('get_series_info', { series_id: id });
    const info = data?.info ?? {};
    const episodes: Record<number, Episode[]> = {};
    const raw = data?.episodes ?? {};
    const groups: any[][] = Array.isArray(raw) ? [raw.flat()] : Object.values(raw);
    for (const group of groups) {
      if (!Array.isArray(group)) continue;
      for (const e of group) {
        const season = Number(e.season ?? 1);
        const ext = str(e.container_extension) ?? 'mp4';
        (episodes[season] ??= []).push({
          id: String(e.id),
          title: str(e.title) ?? `Episódio ${e.episode_num}`,
          season,
          episode: Number(e.episode_num ?? 0),
          url: `${this.base}/series/${this.user}/${this.pass}/${e.id}.${ext}`,
          icon: str(e.info?.movie_image),
          plot: str(e.info?.plot),
          duration: str(e.info?.duration),
        });
      }
    }
    Object.values(episodes).forEach((list) => list.sort((a, b) => a.episode - b.episode));
    const seasons = Object.keys(episodes)
      .map(Number)
      .sort((a, b) => a - b);
    return {
      name: str(info.name) ?? '',
      icon: str(info.cover),
      backdrop: firstOf(info.backdrop_path),
      plot: str(info.plot),
      cast: str(info.cast),
      director: str(info.director),
      genre: str(info.genre),
      releaseDate: str(info.releaseDate) ?? str(info.release_date),
      rating: str(info.rating),
      seasons,
      episodes,
    };
  }

  async getShortEpg(channel: LiveChannel): Promise<EpgEntry[]> {
    const data = await this.api('get_short_epg', { stream_id: channel.id, limit: '8' });
    const list = data?.epg_listings;
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    const mapped: EpgEntry[] = list
      .map((e: any) => ({
        title: decodeBase64(e.title),
        description: decodeBase64(e.description),
        start: Number(e.start_timestamp) * 1000,
        end: Number(e.stop_timestamp) * 1000,
      }))
      .filter((e: EpgEntry) => e.end > now);
    // Deduplicate consecutive entries with the same programme title
    return mapped.filter((e, i) => i === 0 || e.title !== mapped[i - 1].title);
  }
}

