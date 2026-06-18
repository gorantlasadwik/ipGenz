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
import axios from 'axios';

export class XtreamAdapter implements ProviderAdapter {
  private baseUrl: string;
  private username: string;
  private password?: string;

  constructor(serverUrl: string, username: string, password?: string) {
    this.baseUrl = serverUrl;
    this.username = username;
    this.password = password;
  }

  // Real HTTP request implementation for Xtream Codes player_api.php
  private async fetchFromApi(action: string): Promise<any> {
    const encodedUsername = encodeURIComponent(this.username || '');
    const encodedPassword = encodeURIComponent(this.password || '');
    const url = `${this.baseUrl}/player_api.php?username=${encodedUsername}&password=${encodedPassword}&action=${action}`;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      return res.data;
    } catch (err) {
      console.error(`Error connecting to Xtream Codes server for action=${action}:`, err.message);
      throw new Error(`Failed to connect to Xtream Codes server: ${err.message}`);
    }
  }

  private verifyArray(data: any, actionName: string): any[] {
    if (!Array.isArray(data)) {
      if (data && typeof data === 'object') {
        if (data.user_info && data.user_info.auth === 0) {
          throw new Error('Authentication failed: Invalid username or password.');
        }
        if (data.status === 'error' || data.message) {
          throw new Error(`Server returned error: ${data.message || data.status}`);
        }
      }
      throw new Error(`Invalid response format from server for ${actionName}. Please check your server URL and credentials.`);
    }
    return data;
  }

  async getLiveCategories(): Promise<InternalLiveCategory[]> {
    const data = await this.fetchFromApi('get_live_categories');
    const verified = this.verifyArray(data, 'get_live_categories');
    return verified.map((cat: any) => ({
      providerCategoryId: cat.category_id?.toString(),
      name: cat.category_name,
    }));
  }

  async getLiveChannels(): Promise<InternalChannel[]> {
    const data = await this.fetchFromApi('get_live_streams');
    const verified = this.verifyArray(data, 'get_live_streams');
    return verified.map((stream: any) => ({
      providerCategoryId: stream.category_id?.toString(),
      providerStreamId: stream.stream_id?.toString(),
      name: stream.name,
      logo: stream.stream_icon,
      streamUrl: `${this.baseUrl}/live/${this.username}/${this.password}/${stream.stream_id}.ts`,
      epgId: stream.epg_channel_id?.toString(),
    }));
  }

  async getMovieCategories(): Promise<InternalMovieCategory[]> {
    const data = await this.fetchFromApi('get_vod_categories');
    const verified = this.verifyArray(data, 'get_vod_categories');
    return verified.map((cat: any) => ({
      providerCategoryId: cat.category_id?.toString(),
      name: cat.category_name,
    }));
  }

  async getMovies(): Promise<InternalMovie[]> {
    const data = await this.fetchFromApi('get_vod_streams');
    const verified = this.verifyArray(data, 'get_vod_streams');
    return verified.map((movie: any) => ({
      providerCategoryId: movie.category_id?.toString(),
      providerStreamId: movie.stream_id?.toString(),
      name: movie.name,
      poster: movie.stream_icon,
      rating: typeof movie.rating === 'string' ? parseFloat(movie.rating) : movie.rating,
      streamUrl: `${this.baseUrl}/movie/${this.username}/${this.password}/${movie.stream_id}.${movie.container_extension || 'mp4'}`,
    }));
  }

  async getMovieInfo(movieId: string): Promise<Partial<InternalMovie>> {
    const data = await this.fetchFromApi(`get_vod_info&vod_id=${movieId}`);
    if (!data || !data.info) return {};
    const info = data.info;
    return {
      description: info.plot || info.description,
      director: info.director,
      actors: info.cast || info.actors,
      poster: info.movie_image || info.cover_big,
      backdrop: info.backdrop_path?.[0] || info.backdrop_path,
      year: parseInt(info.releasedate, 10) || undefined,
      duration: parseInt(info.duration_secs, 10) || parseInt(info.duration, 10) || undefined,
      rating: parseFloat(info.rating) || undefined,
    };
  }

  async getSeriesCategories(): Promise<InternalSeriesCategory[]> {
    const data = await this.fetchFromApi('get_series_categories');
    const verified = this.verifyArray(data, 'get_series_categories');
    return verified.map((cat: any) => ({
      providerCategoryId: cat.category_id?.toString(),
      name: cat.category_name,
    }));
  }

  async getSeries(): Promise<InternalSeries[]> {
    const data = await this.fetchFromApi('get_series');
    const verified = this.verifyArray(data, 'get_series');
    return verified.map((series: any) => ({
      providerCategoryId: series.category_id?.toString(),
      providerSeriesId: series.series_id?.toString(),
      name: series.name,
      poster: series.cover,
      backdrop: series.backdrop_path,
    }));
  }

  async getEpisodes(seriesId: string): Promise<InternalEpisode[]> {
    const data = await this.fetchFromApi(`get_series_info&series_id=${seriesId}`);
    const episodes: InternalEpisode[] = [];
    
    if (data && data.episodes) {
      const seasons = Object.keys(data.episodes);
      for (const seasonNum of seasons) {
        const list = data.episodes[seasonNum] || [];
        for (const ep of list) {
          episodes.push({
            providerSeriesId: seriesId,
            seasonNumber: parseInt(seasonNum, 10) || 1,
            providerEpisodeId: ep.id?.toString() || ep.episode_num?.toString(),
            episodeNumber: ep.episode_num || 1,
            title: ep.title || `Episode ${ep.episode_num}`,
            description: ep.info?.plot || ep.plot || '',
            streamUrl: `${this.baseUrl}/series/${this.username}/${this.password}/${ep.id || ep.episode_num}.${ep.container_extension || 'mp4'}`,
            duration: parseInt(ep.info?.duration, 10) || undefined,
          });
        }
      }
    }
    return episodes;
  }
}
