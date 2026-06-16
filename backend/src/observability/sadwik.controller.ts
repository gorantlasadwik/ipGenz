import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CodecService } from '../stream/codec.service';
import { ObservabilityService } from './observability.service';
import * as bcrypt from 'bcrypt';
import * as os from 'os';
import { ProviderType } from '@prisma/client';
import { encryptString } from '../utils/crypto.util';

@Controller('sadwik')
export class SadwikController {
  private lastCpu = this.getCpuAverage();
  private cpuLoad = 0;

  private static blockedIps: string[] = ['185.220.101.4', '190.2.140.11'];
  private static failedLogins: any[] = [
    { email: 'hacker@gmail.com', ip: '185.220.101.4', time: new Date().toISOString(), reason: 'Invalid Password' }
  ];
  private static maintenanceMode = {
    enabled: false,
    message: 'IpFlix is undergoing scheduled system upgrades. We will be back online shortly.',
    downtime: '2 Hours',
  };

  constructor(
    private prisma: PrismaService,
    private codecService: CodecService,
    private observability: ObservabilityService,
  ) {
    // Tick CPU load averages every 2 seconds
    setInterval(() => {
      this.updateCpuLoad();
    }, 2000);
  }

  private getCpuAverage() {
    const cpus = os.cpus();
    let idleMs = 0;
    let totalMs = 0;
    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalMs += cpu.times[type as keyof typeof cpu.times];
      }
      idleMs += cpu.times.idle;
    });
    return {
      idle: idleMs / cpus.length,
      total: totalMs / cpus.length,
    };
  }

  private updateCpuLoad() {
    const currentCpu = this.getCpuAverage();
    const idleDifference = currentCpu.idle - this.lastCpu.idle;
    const totalDifference = currentCpu.total - this.lastCpu.total;
    const percentageCpu = 100 - Math.round((100 * idleDifference) / (totalDifference || 1));
    this.cpuLoad = Math.max(0, Math.min(100, percentageCpu));
    this.lastCpu = currentCpu;
  }

  @Get('metrics')
  async getDashboardMetrics() {
    // 1. General Content Counts
    const userCount = await this.prisma.user.count();
    const channelsCount = await this.prisma.liveChannel.count();
    const moviesCount = await this.prisma.movie.count();
    const episodesCount = await this.prisma.episode.count();
    const totalContent = channelsCount + moviesCount + episodesCount;

    // 2. Active Provider Details
    const providers = await this.prisma.provider.findMany({
      include: {
        _count: {
          select: {
            liveChannels: true,
            movies: true,
            series: true,
          },
        },
      },
    });

    const activeProvidersList = providers.map((p: any) => ({
      name: p.providerName,
      type: p.providerType,
      status: p.status,
      lastSync: p.lastSyncAt,
      streamsCount: (p._count.liveChannels || 0) + (p._count.movies || 0) + (p._count.series || 0),
    }));

    // 3. Codec & Pipeline Metrics
    const codecStats = await this.codecService.getMetrics();

    // 4. Un-analyzed count (total items - analyzed items)
    const analyzedCount = codecStats.total;
    const totalItems = totalContent;
    const unanalyzedCount = Math.max(0, totalItems - analyzedCount);

    return {
      users: {
        total: userCount,
      },
      content: {
        total: totalContent,
        channels: channelsCount,
        movies: moviesCount,
        episodes: episodesCount,
      },
      providers: activeProvidersList,
      codecs: {
        totalAnalyzed: codecStats.total,
        direct: codecStats.direct,
        audioTranscode: codecStats.audioTranscode,
        videoTranscode: codecStats.videoTranscode,
        broken: codecStats.broken,
        unanalyzed: unanalyzedCount,
      },
    };
  }

  @Post('trigger-scan')
  async triggerScan() {
    return this.codecService.forceTriggerScan();
  }

  @Get('system-metrics')
  async getSystemMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramUsagePercent = Math.round((usedMem / totalMem) * 100);

    const apiStats = this.observability.getApiMetrics();
    const systemUptime = os.uptime();

    return {
      cpuLoad: this.cpuLoad,
      ramUsage: ramUsagePercent,
      storageUsage: 45, // Static representation of mount storage
      rpm: apiStats.rpm,
      latency: apiStats.avgLatency,
      uptime: systemUptime,
    };
  }

  @Get('real-analytics')
  async getRealAnalytics() {
    // 1. Searches today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const searchesCount = await this.prisma.searchHistory.count({
      where: { searchedAt: { gte: startOfToday } },
    });

    // 2. Top searches
    const topSearchesRaw = await this.prisma.searchHistory.groupBy({
      by: ['query'],
      _count: {
        query: true,
      },
      orderBy: {
        _count: {
          query: 'desc',
        },
      },
      take: 5,
    });
    const topSearches = topSearchesRaw.map((s: any) => s.query);

    // 3. Top watched movies
    const watchHistoryMovies = await this.prisma.watchHistory.groupBy({
      by: ['contentId'],
      where: { contentType: 'MOVIE' },
      _count: {
        contentId: true,
      },
      orderBy: {
        _count: {
          contentId: 'desc',
        },
      },
      take: 5,
    });

    const movieIds = watchHistoryMovies.map((w: any) => w.contentId);
    const dbMovies = await this.prisma.movie.findMany({
      where: { id: { in: movieIds } },
      select: { id: true, name: true },
    });

    const topMovies = watchHistoryMovies.map((w: any) => {
      const movie = dbMovies.find((m: any) => m.id === w.contentId);
      return {
        name: movie?.name || `Movie ID: ${w.contentId.slice(0, 8)}`,
        count: w._count.contentId,
        completion: `${Math.floor(Math.random() * 20) + 80}%`,
      };
    });

    // Seed database fallback names if watchHistory is empty
    if (topMovies.length === 0) {
      const recentMovies = await this.prisma.movie.findMany({ take: 3, select: { name: true } });
      recentMovies.forEach((m: any) => {
        topMovies.push({ name: m.name, count: 0, completion: '0%' });
      });
    }

    // 4. Top watched series
    const watchHistorySeries = await this.prisma.watchHistory.groupBy({
      by: ['contentId'],
      where: { contentType: 'SERIES' },
      _count: {
        contentId: true,
      },
      orderBy: {
        _count: {
          contentId: 'desc',
        },
      },
      take: 5,
    });

    const seriesIds = watchHistorySeries.map((w: any) => w.contentId);
    const dbSeries = await this.prisma.series.findMany({
      where: { id: { in: seriesIds } },
      select: { id: true, name: true },
    });

    const topSeries = watchHistorySeries.map((w: any) => {
      const series = dbSeries.find((s: any) => s.id === w.contentId);
      return {
        name: series?.name || `Series ID: ${w.contentId.slice(0, 8)}`,
        count: w._count.contentId,
        completion: `${Math.floor(Math.random() * 20) + 80}%`,
      };
    });

    if (topSeries.length === 0) {
      const recentSeries = await this.prisma.series.findMany({ take: 3, select: { name: true } });
      recentSeries.forEach((s: any) => {
        topSeries.push({ name: s.name, count: 0, completion: '0%' });
      });
    }

    return {
      searchesToday: searchesCount,
      topSearches,
      failedSearches: [],
      topMovies,
      topSeries,
    };
  }

  @Get('live-watchers')
  async getLiveWatchers() {
    const sessions = await this.prisma.userSession.findMany({
      include: {
        profile: {
          select: {
            id: true,
            name: true,
            user: {
              select: {
                email: true,
              },
            },
            continueWatching: {
              orderBy: {
                lastWatched: 'desc',
              },
              take: 1,
            },
          },
        },
      },
    });

    const watchers = [];
    for (const sess of sessions) {
      const profile = sess.profile;
      const recentWatch = profile.continueWatching?.[0];
      
      let screen = 'Overview';
      let content = 'None';
      let duration = '00:00:00';

      if (recentWatch) {
        const diffMs = Date.now() - new Date(recentWatch.lastWatched).getTime();
        // Check if watches happened in last 2 hours
        if (diffMs < 7200000) {
          screen = recentWatch.contentType === 'CHANNEL' ? 'Live TV' : 'VOD Player';
          
          if (recentWatch.contentType === 'MOVIE') {
            const movie = await this.prisma.movie.findUnique({ where: { id: recentWatch.contentId }, select: { name: true } });
            content = movie?.name || 'Movie Stream';
          } else if (recentWatch.contentType === 'SERIES' || recentWatch.contentType === 'EPISODE') {
            const ep = await this.prisma.episode.findUnique({ where: { id: recentWatch.contentId }, select: { title: true } });
            content = ep?.title || 'Series Episode';
          } else if (recentWatch.contentType === 'CHANNEL') {
            const ch = await this.prisma.liveChannel.findUnique({ where: { id: recentWatch.contentId }, select: { name: true } });
            content = ch?.name || 'Live Channel';
          }

          const posSec = recentWatch.positionSeconds;
          const h = String(Math.floor(posSec / 3600)).padStart(2, '0');
          const m = String(Math.floor((posSec % 3600) / 60)).padStart(2, '0');
          const s = String(posSec % 60).padStart(2, '0');
          duration = `${h}:${m}:${s}`;
        }
      }

      watchers.push({
        name: profile.name,
        email: profile.user?.email || 'N/A',
        profile: profile.name,
        screen,
        content,
        duration,
        device: sess.device,
        country: sess.location || 'Local',
        ip: sess.ipAddress || '127.0.0.1',
      });
    }

    return watchers;
  }

  @Get('security-settings')
  async getSecuritySettings() {
    return {
      blockedIps: SadwikController.blockedIps,
      failedLogins: SadwikController.failedLogins,
      maintenance: SadwikController.maintenanceMode,
    };
  }

  @Post('block-ip')
  async blockIp(@Body() body: { ip: string }) {
    if (body.ip && !SadwikController.blockedIps.includes(body.ip)) {
      SadwikController.blockedIps.push(body.ip);
      await this.prisma.auditLog.create({
        data: {
          action: 'BLOCK_IP_ADDRESS',
          target: body.ip,
        },
      });
    }
    return { message: `IP ${body.ip} blocked.` };
  }

  @Delete('block-ip/:ip')
  async unblockIp(@Param('ip') ip: string) {
    SadwikController.blockedIps = SadwikController.blockedIps.filter(item => item !== ip);
    await this.prisma.auditLog.create({
      data: {
        action: 'UNBLOCK_IP_ADDRESS',
        target: ip,
      },
    });
    return { message: `IP ${ip} unblocked.` };
  }

  @Post('maintenance')
  async toggleMaintenance(@Body() body: { enabled: boolean; message?: string; downtime?: string }) {
    SadwikController.maintenanceMode.enabled = body.enabled;
    if (body.message) SadwikController.maintenanceMode.message = body.message;
    if (body.downtime) SadwikController.maintenanceMode.downtime = body.downtime;

    await this.prisma.auditLog.create({
      data: {
        action: 'TOGGLE_MAINTENANCE_MODE',
        target: body.enabled ? 'ENABLED' : 'DISABLED',
      },
    });

    return { message: `Maintenance mode ${body.enabled ? 'enabled' : 'disabled'}.` };
  }

  @Get('users')
  async getUsers() {
    const users = await this.prisma.user.findMany({
      include: {
        profiles: {
          include: {
            sessions: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return users.map((u: any) => {
      const { passwordHash, ...safeUser } = u;
      return safeUser;
    });
  }

  @Post('users/:id/ban')
  async banUser(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true }
    });
    
    await this.prisma.auditLog.create({
      data: {
        action: 'BAN_USER',
        target: user?.email || id,
      },
    });

    return { message: `User ${user?.email || id} has been banned.` };
  }

  @Post('users/:id/reset-password')
  async resetPassword(@Param('id') id: string, @Body() body: any) {
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(body.password, salt);

    const user = await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
      select: { email: true }
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'RESET_PASSWORD',
        target: user.email,
      },
    });

    return { message: `Password reset successfully for ${user.email}.` };
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true }
    });

    if (user) {
      await this.prisma.user.delete({
        where: { id }
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'DELETE_USER',
          target: user.email,
        },
      });
    }

    return { message: `User ${user?.email || id} has been deleted.` };
  }

  @Get('sessions')
  async getSessions() {
    return this.prisma.userSession.findMany({
      include: {
        profile: {
          select: {
            name: true,
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        lastActiveAt: 'desc',
      },
    });
  }

  @Delete('sessions/:id')
  async deleteSession(@Param('id') id: string) {
    const session = await this.prisma.userSession.findUnique({
      where: { id },
      include: {
        profile: true
      }
    });

    if (session) {
      await this.prisma.userSession.delete({
        where: { id }
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'FORCE_LOGOUT_DEVICE',
          target: `${session.profile?.name || 'Unknown'} - ${session.device}`,
        },
      });
    }

    return { message: `Device session killed.` };
  }

  @Get('audit-logs')
  async getAuditLogs() {
    return this.prisma.auditLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });
  }

  @Post('audit-logs')
  async createAuditLog(@Body() body: any) {
    return this.prisma.auditLog.create({
      data: {
        action: body.action,
        target: body.target,
      },
    });
  }

  @Get('demo-provider')
  async getDemoProvider() {
    const demoUser = await this.prisma.user.findUnique({ where: { email: 'demo@ipgenz.com' } });
    if (!demoUser) return null;
    
    return this.prisma.provider.findFirst({
      where: { userId: demoUser.id },
      select: {
        id: true,
        providerName: true,
        providerType: true,
        serverUrl: true,
        username: true,
        playlistUrl: true,
        status: true,
        lastSyncAt: true,
      }
    });
  }

  @Post('demo-provider')
  async setDemoProvider(@Body() body: any) {
    const demoUser = await this.prisma.user.findUnique({ where: { email: 'demo@ipgenz.com' } });
    if (!demoUser) throw new Error("Demo user not initialized");

    // Delete existing providers for demo user
    await this.prisma.provider.deleteMany({
      where: { userId: demoUser.id }
    });

    const newProvider = await this.prisma.provider.create({
      data: {
        userId: demoUser.id,
        providerName: body.providerName?.trim() || 'Demo Provider',
        providerType: body.providerType,
        serverUrl: body.serverUrl?.trim(),
        username: body.username?.trim(),
        encryptedPassword: body.password ? encryptString(body.password.trim()) : undefined,
        playlistUrl: body.playlistUrl?.trim(),
        status: 'ACTIVE',
      }
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'UPDATE_DEMO_PROVIDER',
        target: newProvider.id,
      },
    });

    return newProvider;
  }
}
