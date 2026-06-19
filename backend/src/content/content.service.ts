import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class ContentService {
  constructor(private prisma: PrismaService) {}

  async getRecommendations(profileId: string) {
    const profile: any = await (this.prisma.profile.findUnique as any)({
      where: { id: profileId },
      select: { userId: true, user: { select: { isPremiumTrial: true } } },
    });
    if (!profile) {
      return { recommendedMovies: [], recommendedSeries: [] };
    }
    const userId = (profile.user?.isPremiumTrial && UsersService.trialMasterUserId)
      ? UsersService.trialMasterUserId
      : profile.userId;

    // Check if this user actually has synced movies or series
    const hasMovies = await this.prisma.movie.findFirst({
      where: { provider: { userId } },
    });
    const hasSeries = await this.prisma.series.findFirst({
      where: { provider: { userId } },
    });
    if (!hasMovies && !hasSeries) {
      return { recommendedMovies: [], recommendedSeries: [] };
    }

    // 1. Get user's history and favorites
    const history = await this.prisma.watchHistory.findMany({
      where: { profileId },
      select: { contentId: true, contentType: true },
    });
    
    const favorites = await this.prisma.favorite.findMany({
      where: { profileId },
      select: { contentId: true, contentType: true },
    });

    const watchedMovieIds = history.filter(h => h.contentType === 'MOVIE').map(h => h.contentId);
    const watchedSeriesIds = history.filter(h => h.contentType === 'SERIES' || h.contentType === 'EPISODE').map(h => h.contentId);
    
    // We need to fetch the categories of what they've watched/favorited
    const movieIds = [...new Set([...watchedMovieIds, ...favorites.filter(f => f.contentType === 'MOVIE').map(f => f.contentId)])];
    const seriesIds = [...new Set([...watchedSeriesIds, ...favorites.filter(f => f.contentType === 'SERIES').map(f => f.contentId)])];

    const movies = await this.prisma.movie.findMany({
      where: { id: { in: movieIds } },
      select: { movieCategoryId: true }
    });

    const series = await this.prisma.series.findMany({
      where: { id: { in: seriesIds } },
      select: { seriesCategoryId: true }
    });

    // Count category frequencies
    const movieCategoryCounts: Record<string, number> = {};
    movies.forEach(m => {
      movieCategoryCounts[m.movieCategoryId] = (movieCategoryCounts[m.movieCategoryId] || 0) + 1;
    });

    const seriesCategoryCounts: Record<string, number> = {};
    series.forEach(s => {
      seriesCategoryCounts[s.seriesCategoryId] = (seriesCategoryCounts[s.seriesCategoryId] || 0) + 1;
    });

    // Sort to get top 3 categories
    const topMovieCategories = Object.entries(movieCategoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);

    const topSeriesCategories = Object.entries(seriesCategoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);

    let recommendedMovies = [];
    let recommendedSeries = [];

    if (topMovieCategories.length > 0) {
      recommendedMovies = await this.prisma.movie.findMany({
        where: {
          provider: { userId },
          movieCategoryId: { in: topMovieCategories },
          id: { notIn: watchedMovieIds }, // Don't recommend already watched
          poster: { not: null }
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    } else {
      // Fallback: newest movies with posters
      recommendedMovies = await this.prisma.movie.findMany({
        where: { provider: { userId }, poster: { not: null }, id: { notIn: watchedMovieIds } },
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    }

    if (topSeriesCategories.length > 0) {
      recommendedSeries = await this.prisma.series.findMany({
        where: {
          provider: { userId },
          seriesCategoryId: { in: topSeriesCategories },
          id: { notIn: watchedSeriesIds },
          poster: { not: null }
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    } else {
      // Fallback: newest series with posters
      recommendedSeries = await this.prisma.series.findMany({
        where: { provider: { userId }, poster: { not: null }, id: { notIn: watchedSeriesIds } },
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
    }

    // Shuffle results lightly
    recommendedMovies = recommendedMovies.sort(() => 0.5 - Math.random());
    recommendedSeries = recommendedSeries.sort(() => 0.5 - Math.random());

    return {
      recommendedMovies,
      recommendedSeries
    };
  }
}
