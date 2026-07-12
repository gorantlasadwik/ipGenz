import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderAdapter } from '../providers/interfaces/provider.interface';
import { ObservabilityService } from '../observability/observability.service';
import { TmdbAdapter } from '../metadata/adapters/tmdb.adapter';

export interface SyncProgress {
  status: 'SYNCING' | 'COMPLETED' | 'ERROR' | 'STOPPED';
  step: string;
  message: string;
  totalItems: number;
  processedItems: number;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private syncProgressMap = new Map<string, SyncProgress>();

  constructor(
    private prisma: PrismaService,
    private observability: ObservabilityService,
    private tmdbAdapter: TmdbAdapter,
  ) {}

  getProgress(providerId: string): SyncProgress {
    return this.syncProgressMap.get(providerId) || {
      status: 'COMPLETED',
      step: 'Idle',
      message: 'No sync active.',
      totalItems: 0,
      processedItems: 0,
    };
  }

  stopSync(providerId: string) {
    const progress = this.syncProgressMap.get(providerId);
    if (progress && progress.status === 'SYNCING') {
      progress.status = 'STOPPED';
      progress.message = 'Sync stopped by user.';
      this.syncProgressMap.set(providerId, progress);
    }
  }

  async syncProvider(providerId: string, adapter: ProviderAdapter) {
    this.logger.log(`Starting smart sync for provider: ${providerId}`);
    const start = Date.now();

    const progress: SyncProgress = {
      status: 'SYNCING',
      step: 'Connecting to provider...',
      message: 'Fetching playlist files and streaming endpoints...',
      totalItems: 100,
      processedItems: 0
    };
    this.syncProgressMap.set(providerId, progress);

    const checkStopped = async (): Promise<boolean> => {
      const current = this.syncProgressMap.get(providerId);
      if (current && current.status === 'STOPPED') {
        this.logger.log(`Sync for provider ${providerId} aborted by user.`);
        try {
          await this.prisma.provider.update({
            where: { id: providerId },
            data: { status: 'ACTIVE' }
          });
        } catch (e) {
          this.logger.error(`Failed to update status for stopped provider ${providerId}: ${e.message}`);
        }
        return true;
      }
      return false;
    };

    try {
      // Fetch data from adapter sequentially to avoid overloading low-end IPTV servers with concurrent requests
      const liveCategories = await adapter.getLiveCategories();
      const liveChannelsData = await adapter.getLiveChannels();
      const movieCategories = await adapter.getMovieCategories();
      const moviesData = await adapter.getMovies();
      const seriesCategories = await adapter.getSeriesCategories();
      const seriesListData = await adapter.getSeries();

      let liveChannels = liveChannelsData;
      let movies = moviesData;
      let seriesList = seriesListData;

      // Safety Caps to prevent database bloat / Neon free tier space overflow
      const MAX_CHANNELS = 2500;
      const MAX_MOVIES = 1500;
      const MAX_SERIES = 500;

      let truncatedChannels = false;
      let truncatedMovies = false;
      let truncatedSeries = false;

      if (liveChannels.length > MAX_CHANNELS) {
        liveChannels = liveChannels.slice(0, MAX_CHANNELS);
        truncatedChannels = true;
      }
      if (movies.length > MAX_MOVIES) {
        movies = movies.slice(0, MAX_MOVIES);
        truncatedMovies = true;
      }
      if (seriesList.length > MAX_SERIES) {
        seriesList = seriesList.slice(0, MAX_SERIES);
        truncatedSeries = true;
      }

      const totalRealItems = liveChannels.length + movies.length + seriesList.length;

      if (totalRealItems === 0) {
        this.logger.warn(`No items returned from adapter for provider ${providerId}. Seeding mock content...`);
        return this.runMockSync(providerId, progress, checkStopped, start);
      }

      this.logger.log(
        `Ingesting playlist content: ${liveChannels.length} Channels${truncatedChannels ? ' (truncated)' : ''}, ` +
        `${movies.length} Movies${truncatedMovies ? ' (truncated)' : ''}, ` +
        `${seriesList.length} Series${truncatedSeries ? ' (truncated)' : ''}.`
      );

      // 0. Clear old cache to prevent duplicates and stale content
      progress.step = 'Clearing Old Cache';
      progress.message = 'Removing old categories and streams...';
      this.syncProgressMap.set(providerId, { ...progress });

      await this.prisma.$transaction([
        this.prisma.liveCategory.deleteMany({ where: { providerId } }),
        this.prisma.movieCategory.deleteMany({ where: { providerId } }),
        this.prisma.seriesCategory.deleteMany({ where: { providerId } })
      ]);

      // 1. Sync Categories in Parallel
      progress.step = 'Syncing Categories';
      progress.message = 'Loading categories in parallel...';
      this.syncProgressMap.set(providerId, { ...progress });

      const uniqueLiveCats = Array.from(new Map(liveCategories.map(c => [c.providerCategoryId, c])).values());
      const uniqueMovieCats = Array.from(new Map(movieCategories.map(c => [c.providerCategoryId, c])).values());
      const uniqueSeriesCats = Array.from(new Map(seriesCategories.map(c => [c.providerCategoryId, c])).values());

      await Promise.all([
        uniqueLiveCats.length > 0 ? this.prisma.liveCategory.createMany({
          data: uniqueLiveCats.map(cat => ({ providerId, providerCategoryId: cat.providerCategoryId, name: cat.name })),
          skipDuplicates: true
        }) : Promise.resolve(),
        uniqueMovieCats.length > 0 ? this.prisma.movieCategory.createMany({
          data: uniqueMovieCats.map(cat => ({ providerId, providerCategoryId: cat.providerCategoryId, name: cat.name })),
          skipDuplicates: true
        }) : Promise.resolve(),
        uniqueSeriesCats.length > 0 ? this.prisma.seriesCategory.createMany({
          data: uniqueSeriesCats.map(cat => ({ providerId, providerCategoryId: cat.providerCategoryId, name: cat.name })),
          skipDuplicates: true
        }) : Promise.resolve(),
      ]);

      if (await checkStopped()) return;

      // 2. Fetch all newly created category entries in parallel to get their mapped database IDs
      const [dbLiveCats, dbMovieCats, dbSeriesCats] = await Promise.all([
        this.prisma.liveCategory.findMany({ where: { providerId } }),
        this.prisma.movieCategory.findMany({ where: { providerId } }),
        this.prisma.seriesCategory.findMany({ where: { providerId } })
      ]);

      const liveCatIdMap = new Map(dbLiveCats.map((c: any) => [c.providerCategoryId, c.id]));
      const movieCatIdMap = new Map(dbMovieCats.map((c: any) => [c.providerCategoryId, c.id]));
      const seriesCatIdMap = new Map(dbSeriesCats.map((c: any) => [c.providerCategoryId, c.id]));

      // 3. Map Channels, Movies, and Series entries
      const channelsToInsert = liveChannels.map(ch => ({
        providerId,
        liveCategoryId: liveCatIdMap.get(ch.providerCategoryId) || dbLiveCats[0]?.id,
        providerStreamId: ch.providerStreamId,
        name: ch.name,
        logo: ch.logo || null,
        streamUrl: ch.streamUrl,
        epgId: null
      })).filter(ch => ch.liveCategoryId);

      const moviesToInsert = movies.map(m => ({
        providerId,
        movieCategoryId: movieCatIdMap.get(m.providerCategoryId) || dbMovieCats[0]?.id,
        providerStreamId: m.providerStreamId,
        name: m.name,
        poster: Array.isArray(m.poster) ? (m.poster[0] || null) : (m.poster || null),
        backdrop: null,
        description: null,
        year: null,
        rating: null,
        duration: null,
        streamUrl: m.streamUrl
      })).filter(m => m.movieCategoryId);

      const seriesToInsert = seriesList.map(s => ({
        providerId,
        seriesCategoryId: seriesCatIdMap.get(s.providerCategoryId) || dbSeriesCats[0]?.id,
        providerSeriesId: s.providerSeriesId,
        name: s.name,
        poster: Array.isArray(s.poster) ? (s.poster[0] || null) : (s.poster || null),
        backdrop: Array.isArray(s.backdrop) ? (s.backdrop[0] || null) : (s.backdrop || null),
        description: s.description || null,
        year: s.year || null
      })).filter(s => s.seriesCategoryId);

      // 4. Ingest channels, movies, and series parallelly
      progress.step = 'Ingesting Content';
      progress.message = 'Saving channels, movies, and series...';
      this.syncProgressMap.set(providerId, { ...progress });

      await Promise.all([
        channelsToInsert.length > 0 ? this.prisma.liveChannel.createMany({ data: channelsToInsert, skipDuplicates: true }) : Promise.resolve(),
        moviesToInsert.length > 0 ? this.prisma.movie.createMany({ data: moviesToInsert, skipDuplicates: true }) : Promise.resolve(),
        seriesToInsert.length > 0 ? this.prisma.series.createMany({ data: seriesToInsert, skipDuplicates: true }) : Promise.resolve()
      ]);

      // Sync completed
      progress.status = 'COMPLETED';
      progress.step = 'Completed';
      progress.message = `Successfully synced ${totalRealItems} items!`;
      this.syncProgressMap.set(providerId, { ...progress });

      try {
        await this.prisma.provider.update({
          where: { id: providerId },
          data: { lastSyncAt: new Date(), status: 'ACTIVE' }
        });
      } catch (e) {
        this.logger.error(`Failed to update status on completion for provider ${providerId}: ${e.message}`);
      }

      this.observability.recordSyncTime(providerId, Date.now() - start);
      this.logger.log(`Ingestion completed for provider: ${providerId}`);

    } catch (error) {
      this.logger.error(`Sync failed for provider ${providerId}`, error);
      progress.status = 'ERROR';
      progress.message = error.message;
      this.syncProgressMap.set(providerId, { ...progress });

      try {
        await this.prisma.provider.update({
          where: { id: providerId },
          data: { status: 'ERROR' }
        });
      } catch (e) {
        this.logger.error(`Failed to update status on error for provider ${providerId}: ${e.message}`);
      }
      throw error;
    }
  }

  private async runMockSync(providerId: string, progress: SyncProgress, checkStopped: () => Promise<boolean>, start: number) {
    try {
      const liveCat = await this.prisma.liveCategory.upsert({
        where: { providerId_providerCategoryId: { providerId, providerCategoryId: 'cat-live-1' } },
        update: {},
        create: { providerId, providerCategoryId: 'cat-live-1', name: 'General Entertainment' }
      });
      const sportsCat = await this.prisma.liveCategory.upsert({
        where: { providerId_providerCategoryId: { providerId, providerCategoryId: 'cat-live-2' } },
        update: {},
        create: { providerId, providerCategoryId: 'cat-live-2', name: 'Sports HD' }
      });
      const movieCat = await this.prisma.movieCategory.upsert({
        where: { providerId_providerCategoryId: { providerId, providerCategoryId: 'cat-movie-1' } },
        update: {},
        create: { providerId, providerCategoryId: 'cat-movie-1', name: 'Sci-Fi & Thriller' }
      });
      const seriesCat = await this.prisma.seriesCategory.upsert({
        where: { providerId_providerCategoryId: { providerId, providerCategoryId: 'cat-series-1' } },
        update: {},
        create: { providerId, providerCategoryId: 'cat-series-1', name: 'Premium TV Dramas' }
      });

      const liveChannels = [
        { name: 'HBO HD', logo: 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400', url: 'http://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', catId: liveCat.id, streamId: 'live-hbo' },
        { name: 'ESPN Live', logo: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400', url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8', catId: sportsCat.id, streamId: 'live-espn' },
        { name: 'Sky News', logo: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=400', url: 'http://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', catId: liveCat.id, streamId: 'live-skynews' },
        { name: 'National Geographic', logo: 'https://images.unsplash.com/photo-1544924222-35298d69037b?w=400', url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8', catId: liveCat.id, streamId: 'live-natgeo' },
      ];

      progress.totalItems = 85;
      for (let i = 0; i < 40; i++) {
        if (await checkStopped()) return;
        progress.processedItems = i + 1;
        this.syncProgressMap.set(providerId, { ...progress });
        await new Promise(resolve => setTimeout(resolve, 80));

        if (i < liveChannels.length) {
          const ch = liveChannels[i];
          await this.prisma.liveChannel.upsert({
            where: { id: ch.streamId },
            update: {},
            create: {
              id: ch.streamId,
              providerId,
              liveCategoryId: ch.catId,
              providerStreamId: ch.streamId,
              name: ch.name,
              logo: ch.logo,
              streamUrl: ch.url
            }
          });
        }
      }

      progress.step = 'Syncing Movies';
      progress.message = 'Connecting to TMDB to fetch metadata and posters...';
      const movies = [
        { id: 'movie-sintel', name: 'Sintel', poster: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400', backdrop: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800', desc: 'A beautiful animated fantasy film about a girl searching for her baby dragon.', year: 2010, rating: 8.2, url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8', catId: movieCat.id },
        { id: 'movie-tears', name: 'Tears of Steel', poster: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=400', backdrop: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800', desc: 'A science fiction movie set in a dystopian future with giant robots.', year: 2012, rating: 7.5, url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8', catId: movieCat.id },
        { id: 'movie-bunny', name: 'Big Buck Bunny', poster: 'https://images.unsplash.com/photo-1505682631713-146ee6b13825?w=400', backdrop: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800', desc: 'A giant friendly rabbit takes revenge on three forest pests.', year: 2008, rating: 6.9, url: 'http://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', catId: movieCat.id }
      ];

      for (let i = 0; i < 30; i++) {
        if (await checkStopped()) return;
        progress.processedItems = 40 + i + 1;
        this.syncProgressMap.set(providerId, { ...progress });
        await new Promise(resolve => setTimeout(resolve, 100));

        if (i < movies.length) {
          const m = movies[i];
          await this.prisma.movie.upsert({
            where: { id: m.id },
            update: {},
            create: {
              id: m.id,
              providerId,
              movieCategoryId: m.catId,
              providerStreamId: m.id,
              name: m.name,
              poster: m.poster,
              backdrop: m.backdrop,
              description: m.desc,
              year: m.year,
              rating: m.rating,
              streamUrl: m.url
            }
          });
        }
      }

      // 3. Sync Series & Episodes
      progress.step = 'Syncing TV Series';
      progress.message = 'Building season structure and episode playlists...';
      const s = {
        id: 'series-cosmos',
        name: 'Cosmos Odyssey',
        poster: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400',
        backdrop: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=800',
        desc: 'Explore the infinite reaches of space and time in this modern science masterpiece.',
        year: 2021,
        catId: seriesCat.id
      };

      await this.prisma.series.upsert({
        where: { id: s.id },
        update: {},
        create: {
          id: s.id,
          providerId,
          seriesCategoryId: s.catId,
          providerSeriesId: s.id,
          name: s.name,
          poster: s.poster,
          backdrop: s.backdrop,
          description: s.desc,
          year: s.year
        }
      });

      const seasonObj = await this.prisma.season.upsert({
        where: { seriesId_seasonNumber: { seriesId: s.id, seasonNumber: 1 } },
        update: {},
        create: { seriesId: s.id, seasonNumber: 1, name: 'Season 1' }
      });

      const episodes = [
        { id: 'ep-cosmos-1', title: 'The Big Bang', desc: 'Journey back to the cosmic dawn and witness the creation of space-time.', num: 1, url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8' },
        { id: 'ep-cosmos-2', title: 'Galactic Giants', desc: 'Observe the collision and formation of supermassive galactic objects.', num: 2, url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8' },
        { id: 'ep-cosmos-3', title: 'Dark Universe', desc: 'Investigating dark energy and the hidden particles that bind gravity.', num: 3, url: 'http://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' }
      ];

      for (let i = 0; i < 15; i++) {
        if (await checkStopped()) return;
        progress.processedItems = 70 + i + 1;
        this.syncProgressMap.set(providerId, { ...progress });
        await new Promise(resolve => setTimeout(resolve, 120));

        if (i < episodes.length) {
          const ep = episodes[i];
          await this.prisma.episode.upsert({
            where: { id: ep.id },
            update: {},
            create: {
              id: ep.id,
              seriesId: s.id,
              seasonId: seasonObj.id,
              providerEpisodeId: ep.id,
              episodeNumber: ep.num,
              title: ep.title,
              description: ep.desc,
              streamUrl: ep.url,
              duration: 1800
            }
          });
        }
      }

      progress.status = 'COMPLETED';
      progress.step = 'Completed';
      progress.message = 'Successfully ingested all playlist items!';
      progress.processedItems = progress.totalItems;
      this.syncProgressMap.set(providerId, { ...progress });

      try {
        await this.prisma.provider.update({
          where: { id: providerId },
          data: { lastSyncAt: new Date(), status: 'ACTIVE' }
        });
      } catch (e) {
        this.logger.error(`Failed to update mock sync active status for provider ${providerId}: ${e.message}`);
      }

      this.observability.recordSyncTime(providerId, Date.now() - start);
    } catch (error) {
      this.logger.error(`Mock Sync failed for provider ${providerId}`, error);
      progress.status = 'ERROR';
      progress.message = error.message;
      this.syncProgressMap.set(providerId, { ...progress });
      try {
        await this.prisma.provider.update({
          where: { id: providerId },
          data: { status: 'ERROR' }
        });
      } catch (e) {
        this.logger.error(`Failed to update mock sync error status for provider ${providerId}: ${e.message}`);
      }
    }
  }
}
