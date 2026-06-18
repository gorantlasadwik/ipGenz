// Internal Models that ALL provider adapters must map their data to.
// This ensures that our core sync logic remains completely provider-agnostic.

export interface InternalLiveCategory {
  providerCategoryId: string;
  name: string;
}

export interface InternalChannel {
  providerCategoryId: string;
  providerStreamId: string;
  name: string;
  logo?: string;
  streamUrl: string;
  epgId?: string;
}

export interface InternalMovieCategory {
  providerCategoryId: string;
  name: string;
}

export interface InternalMovie {
  providerCategoryId: string;
  providerStreamId: string;
  name: string;
  poster?: string;
  backdrop?: string;
  description?: string;
  director?: string;
  actors?: string;
  year?: number;
  rating?: number;
  duration?: number;
  streamUrl: string;
}

export interface InternalSeriesCategory {
  providerCategoryId: string;
  name: string;
}

export interface InternalSeries {
  providerCategoryId: string;
  providerSeriesId: string;
  name: string;
  poster?: string;
  backdrop?: string;
  description?: string;
  director?: string;
  actors?: string;
  year?: number;
}

export interface InternalEpisode {
  providerSeriesId: string;
  seasonNumber: number;
  providerEpisodeId: string;
  episodeNumber: number;
  title?: string;
  description?: string;
  streamUrl: string;
  duration?: number;
}

export interface ProviderAdapter {
  getLiveCategories(): Promise<InternalLiveCategory[]>;
  getLiveChannels(): Promise<InternalChannel[]>;
  
  getMovieCategories(): Promise<InternalMovieCategory[]>;
  getMovies(): Promise<InternalMovie[]>;
  getMovieInfo?(movieId: string): Promise<Partial<InternalMovie>>;
  
  getSeriesCategories(): Promise<InternalSeriesCategory[]>;
  getSeries(): Promise<InternalSeries[]>;
  getSeriesInfo?(seriesId: string): Promise<Partial<InternalSeries>>;
  getEpisodes(seriesId: string): Promise<InternalEpisode[]>;
}
