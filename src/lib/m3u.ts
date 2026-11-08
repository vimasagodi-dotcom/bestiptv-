import type {
  Category,
  ContentProvider,
  Episode,
  LiveChannel,
  Movie,
  MovieInfo,
  Playlist,
  Series,
  SeriesInfo,
} from './types';

export interface M3UEntry {
  name: string;
  url: string;
  group: string;
  logo?: string;
  tvgId?: string;
  attrs: Record<string, string>;
}

const ATTR_RE = /([\w-]+)="([^"]*)"/g;

export function parseM3U(text: string): M3UEntry[] {
  const lines = text.split(/\r?\n/);
  const out: M3UEntry[] = [];
  let current: Omit<M3UEntry, 'url'> | null = null;
  let extGrp: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const attrs: Record<string, string> = {};
      for (const m of line.matchAll(ATTR_RE)) attrs[m[1].toLowerCase()] = m[2];
      const rest = line.replace(ATTR_RE, '');
      const idx = rest.indexOf(',');
      const name = (idx >= 0 ? rest.slice(idx + 1) : '').trim() || attrs['tvg-name'] || 'Sem nome';
      current = {
        name,
        group: attrs['group-title'] || '',
        logo: attrs['tvg-logo'] || undefined,
        tvgId: attrs['tvg-id'] || undefined,
        attrs,
      };
      extGrp = undefined;
    } else if (line.startsWith('#EXTGRP:')) {
      extGrp = line.slice(8).trim();
    } else if (!line.startsWith('#')) {
      if (current) {
        out.push({ ...current, group: current.group || extGrp || 'Sem categoria', url: line });
      } else {
        out.push({ name: line.split('/').pop() || line, url: line, group: 'Sem categoria', attrs: {} });
      }
      current = null;
    }
  }
  return out;
}

type Kind = 'live' | 'movie' | 'series';
const VOD_EXT = /\.(mp4|mkv|avi|mov|wmv|flv|m4v)(\?.*)?$/i;
const EP_RE = /\bS(\d{1,2})\s*E(\d{1,3})\b/i;

function classify(e: M3UEntry): Kind {
  const u = e.url.toLowerCase();
  if (u.includes('/series/')) return 'series';
  if (u.includes('/movie/')) return 'movie';
  if (VOD_EXT.test(u)) return EP_RE.test(e.name) ? 'series' : 'movie';
  return 'live';
}

function seriesName(name: string) {
  return name.replace(/\s*[-|]?\s*S\d{1,2}\s*E\d{1,3}.*$/i, '').trim() || name;
}

interface Parsed {
  liveCats: Category[];
  live: LiveChannel[];
  movieCats: Category[];
  movies: (Movie & { url: string })[];
  seriesCats: Category[];
  series: Series[];
  episodes: Map<string, Episode[]>;
}

export class M3UProvider implements ContentProvider {
  private url: string;
  private data: Promise<Parsed> | null = null;
  headers?: Record<string, string>;

  constructor(playlist: Playlist) {
    this.url = (playlist.url ?? '').trim();
    if (playlist.userAgent) this.headers = { 'User-Agent': playlist.userAgent };
  }

  /** Downloads the list and checks it is a valid M3U. */
  async validate(): Promise<number> {
    const p = await this.load();
    return p.live.length + p.movies.length + p.series.length;
  }

  private load(): Promise<Parsed> {
    if (!this.data) {
      this.data = this.fetchAndParse().catch((e) => {
        this.data = null;
        throw e;
      });
    }
    return this.data;
  }

  private async fetchAndParse(): Promise<Parsed> {
    const res = await fetch(this.url, { headers: this.headers });
    if (!res.ok) throw new Error(`Não foi possível descarregar a lista (HTTP ${res.status})`);
    const text = await res.text();
    if (!text.includes('#EXTINF') && !text.includes('#EXTM3U')) {
      throw new Error('O ficheiro não é uma lista M3U válida');
    }
    const entries = parseM3U(text);
    const cats: Record<Kind, Map<string, Category>> = { live: new Map(), movie: new Map(), series: new Map() };
    const addCat = (k: Kind, name: string) => {
      if (!cats[k].has(name)) cats[k].set(name, { id: name, name });
      return name;
    };

    const live: LiveChannel[] = [];
    const movies: (Movie & { url: string })[] = [];
    const seriesMap = new Map<string, Series>();
    const episodes = new Map<string, Episode[]>();

    entries.forEach((e, i) => {
      const kind = classify(e);
      const categoryId = addCat(kind, e.group);
      if (kind === 'live') {
        live.push({
          id: String(i),
          name: e.name,
          icon: e.logo,
          categoryId,
          url: e.url,
          epgId: e.tvgId,
          num: live.length + 1,
        });
      } else if (kind === 'movie') {
        movies.push({ id: String(i), name: e.name, icon: e.logo, categoryId, url: e.url });
      } else {
        const sName = seriesName(e.name);
        const sid = `${categoryId}::${sName}`;
        if (!seriesMap.has(sid)) seriesMap.set(sid, { id: sid, name: sName, icon: e.logo, categoryId });
        const m = e.name.match(EP_RE);
        const list = episodes.get(sid) ?? [];
        list.push({
          id: String(i),
          title: e.name,
          season: m ? Number(m[1]) : 1,
          episode: m ? Number(m[2]) : list.length + 1,
          url: e.url,
          icon: e.logo,
        });
        episodes.set(sid, list);
      }
    });

    return {
      liveCats: [...cats.live.values()],
      live,
      movieCats: [...cats.movie.values()],
      movies,
      seriesCats: [...cats.series.values()],
      series: [...seriesMap.values()],
      episodes,
    };
  }

  async getAccountInfo() {
    return null;
  }
  async getLiveCategories() {
    return (await this.load()).liveCats;
  }
  async getLiveChannels() {
    return (await this.load()).live;
  }
  async getMovieCategories() {
    return (await this.load()).movieCats;
  }
  async getMovies() {
    return (await this.load()).movies;
  }
  async getSeriesCategories() {
    return (await this.load()).seriesCats;
  }
  async getSeries() {
    return (await this.load()).series;
  }

  async getMovieInfo(id: string): Promise<MovieInfo> {
    const m = (await this.load()).movies.find((x) => x.id === id);
    if (!m) throw new Error('Filme não encontrado');
    return { name: m.name, icon: m.icon, url: m.url, genre: m.categoryId };
  }

  async getSeriesInfo(id: string): Promise<SeriesInfo> {
    const data = await this.load();
    const s = data.series.find((x) => x.id === id);
    if (!s) throw new Error('Série não encontrada');
    const episodes: Record<number, Episode[]> = {};
    for (const ep of data.episodes.get(id) ?? []) (episodes[ep.season] ??= []).push(ep);
    Object.values(episodes).forEach((l) => l.sort((a, b) => a.episode - b.episode));
    return {
      name: s.name,
      icon: s.icon,
      genre: s.categoryId,
      seasons: Object.keys(episodes)
        .map(Number)
        .sort((a, b) => a - b),
      episodes,
    };
  }

  async getShortEpg() {
    return [];
  }
}

