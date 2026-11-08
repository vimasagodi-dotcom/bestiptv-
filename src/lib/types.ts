export type PlaylistType = 'xtream' | 'm3u';
export type LiveFormat = 'm3u8' | 'ts';

export interface Playlist {
  id: string;
  name: string;
  type: PlaylistType;
  /** Xtream Codes */
  server?: string;
  username?: string;
  password?: string;
  /** M3U */
  url?: string;
  userAgent?: string;
  liveFormat?: LiveFormat;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface LiveChannel {
  id: string;
  name: string;
  icon?: string;
  categoryId: string;
  url: string;
  num?: number;
  epgId?: string;
}

export interface Movie {
  id: string;
  name: string;
  icon?: string;
  categoryId: string;
  rating?: string;
  extension?: string;
  url?: string;
}

export interface Series {
  id: string;
  name: string;
  icon?: string;
  categoryId: string;
  rating?: string;
  plot?: string;
}

export interface Episode {
  id: string;
  title: string;
  season: number;
  episode: number;
  url: string;
  icon?: string;
  plot?: string;
  duration?: string;
}

export interface MediaDetails {
  name: string;
  icon?: string;
  backdrop?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  duration?: string;
  rating?: string;
}

export interface MovieInfo extends MediaDetails {
  url: string;
}

export interface SeriesInfo extends MediaDetails {
  seasons: number[];
  episodes: Record<number, Episode[]>;
}

export interface EpgEntry {
  title: string;
  description?: string;
  start: number;
  end: number;
}

export interface AccountInfo {
  status?: string;
  expDate?: number | null;
  maxConnections?: string;
  activeConnections?: string;
}

export type FavoriteKind = 'live' | 'movie' | 'series';

export interface FavoriteItem {
  kind: FavoriteKind;
  id: string;
  name: string;
  icon?: string;
}

export interface ContentProvider {
  getAccountInfo(): Promise<AccountInfo | null>;
  getLiveCategories(): Promise<Category[]>;
  getLiveChannels(): Promise<LiveChannel[]>;
  getMovieCategories(): Promise<Category[]>;
  getMovies(): Promise<Movie[]>;
  getSeriesCategories(): Promise<Category[]>;
  getSeries(): Promise<Series[]>;
  getMovieInfo(id: string): Promise<MovieInfo>;
  getSeriesInfo(id: string): Promise<SeriesInfo>;
  getShortEpg(channel: LiveChannel): Promise<EpgEntry[]>;
  headers?: Record<string, string>;
}

