import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContentType } from '@prisma/client';

@Controller('library')
@UseGuards(JwtAuthGuard)
export class LibraryController {
  constructor(private prisma: PrismaService) {}

  private async hydrateContent(items: any[]) {
    const result = [];
    for (const item of items) {
      let contentMeta = null;
      try {
        if (item.contentType === 'MOVIE') {
          const meta = await this.prisma.movie.findUnique({ where: { id: item.contentId }, select: { name: true, poster: true } });
          if (meta) contentMeta = { title: meta.name, posterUrl: meta.poster };
        } else if (item.contentType === 'SERIES') {
          const meta = await this.prisma.series.findUnique({ where: { id: item.contentId }, select: { name: true, poster: true } });
          if (meta) contentMeta = { title: meta.name, posterUrl: meta.poster };
        } else if (item.contentType === 'CHANNEL') {
          const meta = await this.prisma.liveChannel.findUnique({ where: { id: item.contentId }, select: { name: true, logo: true } });
          if (meta) contentMeta = { title: meta.name, logoUrl: meta.logo };
        } else if (item.contentType === 'EPISODE') {
          const meta = await this.prisma.episode.findUnique({ 
            where: { id: item.contentId }, 
            include: { season: { include: { series: true } } } 
          });
          if (meta) contentMeta = { title: meta.title || `Episode ${meta.episodeNumber}`, posterUrl: meta.season?.series?.poster, seasonId: meta.seasonId };
        }
      } catch (e) {
        console.error('Error hydrating item:', item.contentId);
      }

      if (contentMeta) {
        result.push({ ...item, content: contentMeta });
      } else {
        result.push({ ...item, content: { title: `Unknown ${item.contentType}`, posterUrl: null, logoUrl: null } });
      }
    }
    return result;
  }

  // ─── FAVORITES ─────────────────────────────────────────────────────────────

  @Get('favorites')
  async getFavorites(@Request() req: any, @Query('profileId') profileId: string) {
    const favs = await this.prisma.favorite.findMany({
      where: { profileId, profile: { userId: req.user.userId } },
      orderBy: { createdAt: 'desc' },
    });
    return this.hydrateContent(favs);
  }

  @Post('favorites')
  async addFavorite(@Request() req: any, @Body() body: { profileId: string; contentType: ContentType; contentId: string }) {
    if (req.user.email === 'demo@ipgenz.com') throw new ForbiddenException('Demo users cannot add favorites');
    const profile = await this.prisma.profile.findFirst({ where: { id: body.profileId, userId: req.user.userId } });
    if (!profile) throw new Error('Profile not found or access denied');
    
    return this.prisma.favorite.create({
      data: {
        profileId: body.profileId,
        contentType: body.contentType,
        contentId: body.contentId,
      },
    });
  }

  @Delete('favorites/:id')
  async removeFavorite(@Request() req: any, @Param('id') id: string) {
    const fav = await this.prisma.favorite.findFirst({ where: { id, profile: { userId: req.user.userId } } });
    if (!fav) throw new Error('Not found');
    return this.prisma.favorite.delete({ where: { id } });
  }

  // ─── WATCH LATER ───────────────────────────────────────────────────────────

  @Get('watch-later')
  async getWatchLater(@Request() req: any, @Query('profileId') profileId: string) {
    const items = await this.prisma.watchLater.findMany({
      where: { profileId, profile: { userId: req.user.userId } },
      orderBy: { createdAt: 'desc' },
    });
    return this.hydrateContent(items);
  }

  @Post('watch-later')
  async addWatchLater(@Request() req: any, @Body() body: { profileId: string; contentType: ContentType; contentId: string }) {
    if (req.user.email === 'demo@ipgenz.com') throw new ForbiddenException('Demo users cannot modify watch later');
    const profile = await this.prisma.profile.findFirst({ where: { id: body.profileId, userId: req.user.userId } });
    if (!profile) throw new Error('Profile not found or access denied');
    
    return this.prisma.watchLater.create({
      data: {
        profileId: body.profileId,
        contentType: body.contentType,
        contentId: body.contentId,
      },
    });
  }

  @Delete('watch-later/:id')
  async removeWatchLater(@Request() req: any, @Param('id') id: string) {
    const wl = await this.prisma.watchLater.findFirst({ where: { id, profile: { userId: req.user.userId } } });
    if (!wl) throw new Error('Not found');
    return this.prisma.watchLater.delete({ where: { id } });
  }

  // ─── HISTORY ───────────────────────────────────────────────────────────────

  @Get('history')
  async getHistory(@Request() req: any, @Query('profileId') profileId: string) {
    const items = await this.prisma.watchHistory.findMany({
      where: { profileId, profile: { userId: req.user.userId } },
      orderBy: { watchedAt: 'desc' },
      take: 50,
    });
    return this.hydrateContent(items);
  }

  @Post('history')
  async addHistory(@Request() req: any, @Body() body: { profileId: string; contentType: ContentType; contentId: string }) {
    const profile = await this.prisma.profile.findFirst({ where: { id: body.profileId, userId: req.user.userId } });
    if (!profile) throw new Error('Profile not found or access denied');
    
    return this.prisma.watchHistory.create({
      data: {
        profileId: body.profileId,
        contentType: body.contentType,
        contentId: body.contentId,
      },
    });
  }

  @Post('history/clear')
  async clearHistory(@Request() req: any, @Body() body: { profileId: string }) {
    if (req.user.email === 'demo@ipgenz.com') throw new ForbiddenException('Demo users cannot clear history');
    const profile = await this.prisma.profile.findFirst({ where: { id: body.profileId, userId: req.user.userId } });
    if (!profile) throw new Error('Profile not found or access denied');
    
    return this.prisma.watchHistory.deleteMany({
      where: { profileId: body.profileId }
    });
  }

  // ─── CONTINUE WATCHING ────────────────────────────────────────────────────

  @Get('continue-watching')
  async getContinueWatching(@Request() req: any, @Query('profileId') profileId: string) {
    return this.prisma.continueWatching.findMany({
      where: { profileId, profile: { userId: req.user.userId } },
      orderBy: { lastWatched: 'desc' },
      take: 20,
    });
  }

  @Post('continue-watching')
  async upsertContinueWatching(@Request() req: any, @Body() body: {
    profileId: string;
    contentType: ContentType;
    contentId: string;
    positionSeconds: number;
    durationSeconds?: number;
  }) {
    const profile = await this.prisma.profile.findFirst({ where: { id: body.profileId, userId: req.user.userId } });
    if (!profile) throw new Error('Profile not found or access denied');
    
    return this.prisma.continueWatching.upsert({
      where: {
        profileId_contentId_contentType: {
          profileId: body.profileId,
          contentId: body.contentId,
          contentType: body.contentType,
        },
      },
      update: {
        positionSeconds: body.positionSeconds,
        durationSeconds: body.durationSeconds,
        lastWatched: new Date(),
      },
      create: {
        profileId: body.profileId,
        contentType: body.contentType,
        contentId: body.contentId,
        positionSeconds: body.positionSeconds,
        durationSeconds: body.durationSeconds,
      },
    });
  }

  // ─── PLAYLISTS ─────────────────────────────────────────────────────────────

  @Get('playlists')
  async getPlaylists(@Request() req: any, @Query('profileId') profileId: string) {
    const lists = await this.prisma.playlist.findMany({
      where: { profileId, profile: { userId: req.user.userId } },
      include: {
        items: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    const hydratedLists = [];
    for (const list of lists) {
      const hydratedItems = await this.hydrateContent(list.items);
      hydratedLists.push({ ...list, items: hydratedItems });
    }
    return hydratedLists;
  }

  @Post('playlists')
  async createPlaylist(@Request() req: any, @Body() body: { profileId: string; name: string; description?: string }) {
    if (req.user.email === 'demo@ipgenz.com') throw new ForbiddenException('Demo users cannot create playlists');
    const profile = await this.prisma.profile.findFirst({ where: { id: body.profileId, userId: req.user.userId } });
    if (!profile) throw new Error('Profile not found or access denied');
    
    return this.prisma.playlist.create({
      data: {
        profileId: body.profileId,
        name: body.name,
        description: body.description,
      },
    });
  }

  @Post('playlists/:id/items')
  async addToPlaylist(@Request() req: any, @Param('id') playlistId: string, @Body() body: {
    contentType: ContentType;
    contentId: string;
    position: number;
  }) {
    if (req.user.email === 'demo@ipgenz.com') throw new ForbiddenException('Demo users cannot modify playlists');
    const pl = await this.prisma.playlist.findFirst({ where: { id: playlistId, profile: { userId: req.user.userId } } });
    if (!pl) throw new Error('Playlist not found');
    
    return this.prisma.playlistItem.create({
      data: {
        playlistId,
        contentType: body.contentType,
        contentId: body.contentId,
        position: body.position,
      },
    });
  }

  @Delete('playlists/:id')
  async deletePlaylist(@Request() req: any, @Param('id') id: string) {
    const pl = await this.prisma.playlist.findFirst({ where: { id, profile: { userId: req.user.userId } } });
    if (!pl) throw new Error('Not found');
    return this.prisma.playlist.delete({ where: { id } });
  }
}
