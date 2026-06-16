import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { MetadataPlugin, PluginType } from '../../plugins/interfaces/plugin.interface';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TmdbAdapter implements MetadataPlugin {
  public id = 'plugin-tmdb-metadata';
  public name = 'TMDB Enrichment Engine';
  public version = '1.0.0';
  public type = PluginType.METADATA as const;

  private readonly logger = new Logger(TmdbAdapter.name);
  private apiKey: string;
  private baseUrl = 'https://api.themoviedb.org/3';

  constructor(private httpService: HttpService) {
    this.apiKey = process.env.TMDB_API_KEY || 'MOCK_KEY_FOR_DEV';
  }

  async onInit(): Promise<void> {
    this.logger.log(`Initializing TMDB Adapter (Key present: ${!!this.apiKey})`);
  }

  async onDestroy(): Promise<void> {
    this.logger.log('Destroying TMDB Adapter');
  }

  async fetchMovieMetadata(title: string, year?: number): Promise<any> {
    if (this.apiKey === 'MOCK_KEY_FOR_DEV') {
      // Mock data for development when API key isn't provided
      return {
        poster_path: `https://image.tmdb.org/t/p/w500/mock_poster.jpg`,
        backdrop_path: `https://image.tmdb.org/t/p/original/mock_backdrop.jpg`,
        overview: `A mock overview for ${title}.`,
        vote_average: 8.5
      };
    }

    try {
      const yearQuery = year ? `&year=${year}` : '';
      const url = `${this.baseUrl}/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(title)}${yearQuery}`;
      
      const response = await firstValueFrom(this.httpService.get(url));
      
      if (response.data.results && response.data.results.length > 0) {
        const match = response.data.results[0];
        return {
          poster_path: match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : null,
          backdrop_path: match.backdrop_path ? `https://image.tmdb.org/t/p/original${match.backdrop_path}` : null,
          overview: match.overview,
          vote_average: match.vote_average,
        };
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to fetch TMDB movie metadata for ${title}`, error.message);
      return null;
    }
  }

  async fetchSeriesMetadata(title: string, year?: number): Promise<any> {
    if (this.apiKey === 'MOCK_KEY_FOR_DEV') {
      return {
        poster_path: `https://image.tmdb.org/t/p/w500/mock_poster_tv.jpg`,
        backdrop_path: `https://image.tmdb.org/t/p/original/mock_backdrop_tv.jpg`,
        overview: `A mock TV overview for ${title}.`,
        vote_average: 9.0
      };
    }

    try {
      const yearQuery = year ? `&first_air_date_year=${year}` : '';
      const url = `${this.baseUrl}/search/tv?api_key=${this.apiKey}&query=${encodeURIComponent(title)}${yearQuery}`;
      
      const response = await firstValueFrom(this.httpService.get(url));
      
      if (response.data.results && response.data.results.length > 0) {
        const match = response.data.results[0];
        return {
          poster_path: match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : null,
          backdrop_path: match.backdrop_path ? `https://image.tmdb.org/t/p/original${match.backdrop_path}` : null,
          overview: match.overview,
          vote_average: match.vote_average,
        };
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to fetch TMDB series metadata for ${title}`, error.message);
      return null;
    }
  }
}
