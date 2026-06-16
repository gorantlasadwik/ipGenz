import {
  ProviderAdapter,
  InternalLiveCategory,
  InternalChannel,
  InternalMovieCategory,
  InternalMovie,
  InternalSeriesCategory,
  InternalSeries,
  InternalEpisode
} from '../interfaces/provider.interface';

export class JsonAdapter implements ProviderAdapter {
  constructor(private jsonUrl: string) {}

  async getLiveCategories(): Promise<InternalLiveCategory[]> { return []; }
  async getLiveChannels(): Promise<InternalChannel[]> { return []; }
  async getMovieCategories(): Promise<InternalMovieCategory[]> { return []; }
  async getMovies(): Promise<InternalMovie[]> { return []; }
  async getSeriesCategories(): Promise<InternalSeriesCategory[]> { return []; }
  async getSeries(): Promise<InternalSeries[]> { return []; }
  async getEpisodes(seriesId: string): Promise<InternalEpisode[]> { return []; }
}
