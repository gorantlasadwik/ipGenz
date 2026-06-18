import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { XtreamAdapter } from '../providers/adapters/xtream.adapter';
import { M3UAdapter } from '../providers/adapters/m3u.adapter';
import { decryptString } from '../utils/crypto.util';

@Controller('content')
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private prisma: PrismaService) {}

  // ─── MOVIES ────────────────────────────────────────────────────────────────

  @Get('movies')
  async getMovies(@Request() req: any, @Query('categoryId') categoryId?: string, @Query('limit') limit?: string, @Query('q') q?: string) {
    const take = parseInt(limit || '50');
    return this.prisma.movie.findMany({
      where: {
        provider: { userId: req.user.userId },
        ...(categoryId ? { movieCategoryId: categoryId } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      take,
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    });
  }

  @Get('movies/categories')
  async getMovieCategories(@Request() req: any, @Query('providerId') providerId?: string) {
    return this.prisma.movieCategory.findMany({
      where: {
        provider: { userId: req.user.userId },
        ...(providerId ? { providerId } : {}),
      },
      include: {
        _count: { select: { movies: true } },
      },
    });
  }

  @Get('movies/:id')
  async getMovie(@Request() req: any, @Param('id') id: string) {
    let movie = await this.prisma.movie.findFirst({
      where: { id, provider: { userId: req.user.userId } },
      include: { category: true, provider: true },
    });

    if (!movie) return null;

    // Dynamically fetch description and rich metadata if it's missing (e.g. initial sync didn't pull it)
    if (!movie.description && movie.provider) {
      try {
        let adapter;
        const p = movie.provider;
        if (p.providerType === 'XTREAM') {
          const XtreamAdapter = require('../providers/adapters/xtream.adapter').XtreamAdapter;
          const { decryptString } = require('../utils/crypto.util');
          adapter = new XtreamAdapter(p.serverUrl, p.username, decryptString(p.encryptedPassword));
        } else if (p.providerType === 'M3U') {
          // M3U doesn't have an endpoint for extra info usually
        }

        if (adapter && adapter.getMovieInfo) {
          const info = await adapter.getMovieInfo(movie.providerStreamId);
          if (info && Object.keys(info).length > 0) {
            // Update database with new info
            // Cast to any to suppress local TS errors because local PrismaClient failed to generate
            movie = await (this.prisma.movie.update as any)({
              where: { id: movie?.id },
              data: {
                description: info.description || (movie as any).description,
                director: info.director || (movie as any).director,
                actors: info.actors || (movie as any).actors,
                backdrop: info.backdrop || (movie as any).backdrop,
                poster: info.poster || (movie as any).poster,
                year: info.year || (movie as any).year,
                duration: info.duration || (movie as any).duration,
                rating: info.rating || (movie as any).rating,
              },
              include: { category: true, provider: true },
            });
          }
        }
      } catch (err) {
        // Just log the error, don't fail the request if metadata fetch fails
        console.error(`Failed to fetch dynamic movie info for ${movie?.id}:`, err.message);
      }
    }

    return movie;
  }

  // ─── SERIES ────────────────────────────────────────────────────────────────

  @Get('series')
  async getSeries(@Request() req: any, @Query('categoryId') categoryId?: string, @Query('limit') limit?: string, @Query('q') q?: string) {
    const take = parseInt(limit || '50');
    return this.prisma.series.findMany({
      where: {
        provider: { userId: req.user.userId },
        ...(categoryId ? { seriesCategoryId: categoryId } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      take,
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    });
  }

  @Get('series/categories')
  async getSeriesCategories(@Request() req: any, @Query('providerId') providerId?: string) {
    return this.prisma.seriesCategory.findMany({
      where: {
        provider: { userId: req.user.userId },
        ...(providerId ? { providerId } : {}),
      },
      include: {
        _count: { select: { series: true } },
      },
    });
  }

  @Get('series/:id')
  async getSeriesById(@Request() req: any, @Param('id') id: string) {
    const series = await this.prisma.series.findFirst({
      where: { id, provider: { userId: req.user.userId } },
      include: {
        category: true,
        provider: true,
        seasons: {
          include: { episodes: true },
          orderBy: { seasonNumber: 'asc' },
        },
      },
    });

    if (!series) return null;

    const hasEpisodes = series.seasons.some(s => s.episodes.length > 0);
    const missingMetadata = !series.description;
    let needsRefetch = false;

    if ((!hasEpisodes || missingMetadata) && series.provider) {
      try {
        let adapter;
        if (series.provider.providerType === 'XTREAM') {
          adapter = new XtreamAdapter(
            series.provider.serverUrl!,
            series.provider.username!,
            decryptString(series.provider.encryptedPassword!)
          );
        } else if (series.provider.providerType === 'M3U') {
          adapter = new M3UAdapter(series.provider.playlistUrl!);
        }

        if (adapter) {
          // 1. Fetch missing metadata (description, director, actors, year, backdrop)
          if (missingMetadata && adapter.getSeriesInfo) {
            const info = await adapter.getSeriesInfo(series.providerSeriesId);
            if (info && Object.keys(info).length > 0) {
              // @ts-ignore
              await (this.prisma.series.update as any)({
                where: { id: series.id },
                data: {
                  description: info.description || (series as any).description,
                  director: info.director || (series as any).director,
                  actors: info.actors || (series as any).actors,
                  backdrop: info.backdrop || (series as any).backdrop,
                  poster: info.poster || (series as any).poster,
                  year: info.year || (series as any).year,
                }
              });
              needsRefetch = true;
            }
          }

          // 2. Fetch missing episodes
          if (!hasEpisodes && adapter.getEpisodes) {
            const episodes = await adapter.getEpisodes(series.providerSeriesId);
            if (episodes.length > 0) {
              const episodesBySeason = new Map<number, any[]>();
              for (const ep of episodes) {
                const list = episodesBySeason.get(ep.seasonNumber) || [];
                list.push(ep);
                episodesBySeason.set(ep.seasonNumber, list);
              }

              for (const [seasonNum, epList] of episodesBySeason.entries()) {
                const seasonObj = await this.prisma.season.upsert({
                  where: { seriesId_seasonNumber: { seriesId: series.id, seasonNumber: seasonNum } },
                  update: {},
                  create: { seriesId: series.id, seasonNumber: seasonNum, name: `Season ${seasonNum}` }
                });

                const epToInsert = epList.map(ep => ({
                  seriesId: series.id,
                  seasonId: seasonObj.id,
                  providerEpisodeId: ep.providerEpisodeId,
                  episodeNumber: ep.episodeNumber,
                  title: ep.title || `Episode ${ep.episodeNumber}`,
                  description: ep.description || null,
                  streamUrl: ep.streamUrl,
                  duration: ep.duration || null
                }));

                await this.prisma.episode.createMany({
                  data: epToInsert,
                  skipDuplicates: true
                });
              }
              needsRefetch = true;
            }
          }

          if (needsRefetch) {
            return this.prisma.series.findUnique({
              where: { id },
              include: {
                category: true,
                provider: true,
                seasons: {
                  include: { episodes: true },
                  orderBy: { seasonNumber: 'asc' },
                },
              },
            });
          }
        }
      } catch (err) {
        console.error(`Failed to load dynamic data for series ${series?.id}:`, err.message);
      }
    }

    return series;
  }

  // ─── LIVE TV ───────────────────────────────────────────────────────────────

  @Get('live/channels')
  async getLiveChannels(@Request() req: any, @Query('categoryId') categoryId?: string, @Query('limit') limit?: string, @Query('q') q?: string) {
    const take = parseInt(limit || '100');
    return this.prisma.liveChannel.findMany({
      where: {
        provider: { userId: req.user.userId },
        ...(categoryId ? { liveCategoryId: categoryId } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      take,
      orderBy: { name: 'asc' },
      include: { category: true },
    });
  }

  @Get('live/categories')
  async getLiveCategories(@Request() req: any, @Query('providerId') providerId?: string) {
    return this.prisma.liveCategory.findMany({
      where: {
        provider: { userId: req.user.userId },
        ...(providerId ? { providerId } : {}),
      },
      include: {
        _count: { select: { channels: true } },
      },
    });
  }

  @Get('live/channels/:id')
  async getLiveChannel(@Request() req: any, @Param('id') id: string) {
    return this.prisma.liveChannel.findFirst({
      where: { id, provider: { userId: req.user.userId } },
      include: { category: true, provider: true },
    });
  }

  // ─── SEARCH ────────────────────────────────────────────────────────────────

  @Get('search')
  async search(@Request() req: any, @Query('q') query: string) {
    if (!query || query.length < 2) {
      return { movies: [], series: [], channels: [] };
    }

    const [movies, series, channels] = await Promise.all([
      this.prisma.movie.findMany({
        where: { name: { contains: query, mode: 'insensitive' }, provider: { userId: req.user.userId } },
        take: 20,
        include: { category: true },
      }),
      this.prisma.series.findMany({
        where: { name: { contains: query, mode: 'insensitive' }, provider: { userId: req.user.userId } },
        take: 20,
        include: { category: true },
      }),
      this.prisma.liveChannel.findMany({
        where: { name: { contains: query, mode: 'insensitive' }, provider: { userId: req.user.userId } },
        take: 20,
        include: { category: true },
      }),
    ]);

    return { movies, series, channels };
  }
}
