import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProviderType } from '@prisma/client';
import { encryptString } from '../utils/crypto.util';

@Controller('providers')
@UseGuards(JwtAuthGuard)
export class ProvidersController {
  constructor(private prisma: PrismaService) {}

  @Post()
  async createProvider(@Request() req: any, @Body() body: {
    providerName: string;
    providerType: ProviderType;
    serverUrl?: string;
    username?: string;
    password?: string;
    playlistUrl?: string;
  }) {
    const demoUser = await this.prisma.user.findUnique({ where: { email: 'demo@ipgenz.com' } });
    if (req.user.userId === demoUser?.id) {
      throw new ForbiddenException('Demo users cannot add providers');
    }

    return this.prisma.provider.create({
      data: {
        userId: req.user.userId,
        providerName: body.providerName?.trim(),
        providerType: body.providerType,
        serverUrl: body.serverUrl?.trim(),
        username: body.username?.trim(),
        encryptedPassword: encryptString(body.password?.trim() || ''),
        playlistUrl: body.playlistUrl?.trim(),
        status: 'ACTIVE',
      },
      select: {
        id: true,
        providerName: true,
        providerType: true,
        status: true,
        lastSyncAt: true,
        createdAt: true,
      }
    });
  }

  @Get()
  async getProviders(@Request() req: any) {
    return this.prisma.provider.findMany({
      where: { userId: req.user.userId },
      select: {
        id: true,
        providerName: true,
        providerType: true,
        status: true,
        lastSyncAt: true,
        createdAt: true,
        _count: {
          select: {
            liveChannels: true,
            movies: true,
            series: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id')
  async getProvider(@Request() req: any, @Param('id') id: string) {
    return this.prisma.provider.findFirst({
      where: { id, userId: req.user.userId },
      select: {
        id: true,
        providerName: true,
        providerType: true,
        status: true,
        lastSyncAt: true,
        createdAt: true,
        _count: {
          select: {
            liveChannels: true,
            movies: true,
            series: true,
            liveCategories: true,
            movieCategories: true,
            seriesCategories: true,
          },
        },
      },
    });
  }

  @Delete(':id')
  async deleteProvider(@Request() req: any, @Param('id') id: string) {
    const demoUser = await this.prisma.user.findUnique({ where: { email: 'demo@ipgenz.com' } });
    if (req.user.userId === demoUser?.id) {
      throw new ForbiddenException('Demo users cannot delete providers');
    }

    // Verify ownership
    const provider = await this.prisma.provider.findFirst({
      where: { id, userId: req.user.userId },
    });
    if (!provider) {
      return { error: 'Provider not found' };
    }
    await this.prisma.provider.delete({ where: { id } });
    return { success: true };
  }
}
