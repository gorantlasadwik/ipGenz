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

export class M3UAdapter implements ProviderAdapter {
  private playlistUrl: string;
  private parsed = false;
  private liveCategories: InternalLiveCategory[] = [];
  private liveChannels: InternalChannel[] = [];
  private movieCategories: InternalMovieCategory[] = [];
  private movies: InternalMovie[] = [];
  private seriesCategories: InternalSeriesCategory[] = [];
  private seriesList: InternalSeries[] = [];
  private episodesMap = new Map<string, InternalEpisode[]>();

  constructor(playlistUrl: string) {
    this.playlistUrl = playlistUrl;
  }

  private async parsePlaylist() {
    if (this.parsed) return;
    try {
      const res = await axios.get(this.playlistUrl, { timeout: 20000 });
      const content = res.data || '';
      
      const lines = content.split('\n');
      let currentMeta: {
        name: string;
        logo: string;
        group: string;
        epgId: string;
      } | null = null;

      let categoryIdCounter = 1;
      const liveCatMap = new Map<string, string>();
      const movieCatMap = new Map<string, string>();
      const seriesCatMap = new Map<string, string>();
      const seriesMap = new Map<string, any>();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXTINF:')) {
          // Parse name
          const nameMatch = line.match(/,(.*)$/);
          const name = nameMatch ? nameMatch[1].trim() : 'Unknown';

          // Parse tvg-id
          const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
          const epgId = tvgIdMatch ? tvgIdMatch[1] : '';

          // Parse tvg-logo
          const logoMatch = line.match(/tvg-logo="([^"]*)"/);
          const logo = logoMatch ? logoMatch[1] : '';

          // Parse group-title
          const groupMatch = line.match(/group-title="([^"]*)"/);
          const group = groupMatch ? groupMatch[1] : 'Uncategorized';

          currentMeta = { name, logo, group, epgId };
        } else if (line && !line.startsWith('#') && currentMeta) {
          const streamUrl = line;
          
          // Simple heuristic: movies usually end in common video container formats
          const isMovie = streamUrl.includes('/movie/') || 
                          streamUrl.endsWith('.mp4') || 
                          streamUrl.endsWith('.mkv') || 
                          streamUrl.endsWith('.avi');

          const isSeries = streamUrl.includes('/series/') || 
                           streamUrl.includes('/shows/');

          if (isSeries) {
            let catId = seriesCatMap.get(currentMeta.group);
            if (!catId) {
              catId = `cat-series-${categoryIdCounter++}`;
              seriesCatMap.set(currentMeta.group, catId);
              this.seriesCategories.push({ providerCategoryId: catId, name: currentMeta.group });
            }

            // Guess series structure
            const seriesSeasonEpMatch = currentMeta.name.match(/(.*?)\s+S(\d+)\s*E(\d+)/i);
            let seriesName = currentMeta.name;
            let seasonNum = 1;
            let epNum = 1;
            let epTitle = currentMeta.name;

            if (seriesSeasonEpMatch) {
              seriesName = seriesSeasonEpMatch[1].trim();
              seasonNum = parseInt(seriesSeasonEpMatch[2], 10);
              epNum = parseInt(seriesSeasonEpMatch[3], 10);
              epTitle = `${seriesName} - Season ${seasonNum} Episode ${epNum}`;
            }

            const seriesId = `series-${seriesName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
            if (!seriesMap.has(seriesId)) {
              seriesMap.set(seriesId, {
                providerCategoryId: catId,
                providerSeriesId: seriesId,
                name: seriesName,
                poster: currentMeta.logo,
              });
              this.seriesList.push(seriesMap.get(seriesId));
            }

            const episodeList = this.episodesMap.get(seriesId) || [];
            episodeList.push({
              providerSeriesId: seriesId,
              seasonNumber: seasonNum,
              providerEpisodeId: `ep-${seriesId}-${seasonNum}-${epNum}`,
              episodeNumber: epNum,
              title: epTitle,
              description: '',
              streamUrl,
              duration: undefined,
            });
            this.episodesMap.set(seriesId, episodeList);

          } else if (isMovie) {
            let catId = movieCatMap.get(currentMeta.group);
            if (!catId) {
              catId = `cat-movie-${categoryIdCounter++}`;
              movieCatMap.set(currentMeta.group, catId);
              this.movieCategories.push({ providerCategoryId: catId, name: currentMeta.group });
            }

            const streamId = `movie-${currentMeta.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
            this.movies.push({
              providerCategoryId: catId,
              providerStreamId: streamId,
              name: currentMeta.name,
              poster: currentMeta.logo,
              streamUrl,
            });

          } else {
            let catId = liveCatMap.get(currentMeta.group);
            if (!catId) {
              catId = `cat-live-${categoryIdCounter++}`;
              liveCatMap.set(currentMeta.group, catId);
              this.liveCategories.push({ providerCategoryId: catId, name: currentMeta.group });
            }

            const streamId = `channel-${currentMeta.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
            this.liveChannels.push({
              providerCategoryId: catId,
              providerStreamId: streamId,
              name: currentMeta.name,
              logo: currentMeta.logo,
              streamUrl,
              epgId: currentMeta.epgId,
            });
          }

          currentMeta = null;
        }
      }
      this.parsed = true;
    } catch (err) {
      console.error('Failed to fetch/parse M3U playlist:', err.message);
      throw new Error(`Failed to fetch/parse M3U playlist: ${err.message}`);
    }
  }

  async getLiveCategories(): Promise<InternalLiveCategory[]> {
    await this.parsePlaylist();
    return this.liveCategories;
  }

  async getLiveChannels(): Promise<InternalChannel[]> {
    await this.parsePlaylist();
    return this.liveChannels;
  }

  async getMovieCategories(): Promise<InternalMovieCategory[]> {
    await this.parsePlaylist();
    return this.movieCategories;
  }

  async getMovies(): Promise<InternalMovie[]> {
    await this.parsePlaylist();
    return this.movies;
  }

  async getMovieInfo(movieId: string): Promise<Partial<InternalMovie>> {
    await this.parsePlaylist();
    return {};
  }

  async getSeriesCategories(): Promise<InternalSeriesCategory[]> {
    await this.parsePlaylist();
    return this.seriesCategories;
  }

  async getSeries(): Promise<InternalSeries[]> {
    await this.parsePlaylist();
    return this.seriesList;
  }

  async getSeriesInfo(seriesId: string): Promise<Partial<InternalSeries>> {
    await this.parsePlaylist();
    return {};
  }

  async getEpisodes(seriesId: string): Promise<InternalEpisode[]> {
    await this.parsePlaylist();
    return this.episodesMap.get(seriesId) || [];
  }
}
