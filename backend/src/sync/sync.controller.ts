import { Controller, Post, Get, Param, UseGuards, Request } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { XtreamAdapter } from '../providers/adapters/xtream.adapter';
import { M3UAdapter } from '../providers/adapters/m3u.adapter';
import { decryptString } from '../utils/crypto.util';

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(
    private syncService: SyncService,
    private prisma: PrismaService,
  ) {}

  @Post(':providerId')
  async triggerSync(@Request() req: any, @Param('providerId') providerId: string) {
    console.log(`[SyncController] triggerSync called with providerId=${providerId}, userId=${req.user?.userId}`);
    
    const demoUser = await this.prisma.user.findUnique({ where: { email: 'demo@ipgenz.com' } });
    const trialMasterUser = await this.prisma.user.findUnique({ where: { email: 'trial_master@ipgenz.com' } });
    
    const provider = await this.prisma.provider.findFirst({
      where: { id: providerId },
    });

    if (!provider) {
      return { error: 'Provider not found or unauthorized' };
    }

    const isOwner = provider.userId === req.user.userId;
    const isDemo = demoUser && provider.userId === demoUser.id;
    const isTrialMaster = trialMasterUser && provider.userId === trialMasterUser.id;
    const isAdmin = !req.user.isPremiumTrial && req.user.email !== 'demo@ipgenz.com';

    if (!isOwner && !isDemo && !(isTrialMaster && isAdmin)) {
      return { error: 'Provider not found or unauthorized' };
    }

    // Mark as syncing
    await this.prisma.provider.update({
      where: { id: providerId },
      data: { status: 'SYNCING' },
    });

    // Create appropriate adapter based on provider type
    let adapter;
    switch (provider.providerType) {
      case 'XTREAM':
        adapter = new XtreamAdapter(
          provider.serverUrl!,
          provider.username!,
          decryptString(provider.encryptedPassword!),
        );
        break;
      case 'M3U':
        adapter = new M3UAdapter(provider.playlistUrl!);
        break;
      default:
        return { error: `Provider type ${provider.providerType} sync not yet implemented` };
    }

    // Run sync in background (don't await — return immediately)
    this.syncService.syncProvider(providerId, adapter).catch(async (err) => {
      try {
        await this.prisma.provider.update({
          where: { id: providerId },
          data: { status: 'ERROR' },
        });
      } catch (e) {
        console.error(`Failed to update status to ERROR for deleted provider ${providerId}:`, e.message);
      }
    });

    return { status: 'SYNCING', message: 'Sync started in background' };
  }

  @Get(':providerId/progress')
  async getSyncProgress(@Param('providerId') providerId: string) {
    return this.syncService.getProgress(providerId);
  }

  @Post(':providerId/stop')
  async stopSync(@Param('providerId') providerId: string) {
    this.syncService.stopSync(providerId);
    return { status: 'STOPPING' };
  }
}
