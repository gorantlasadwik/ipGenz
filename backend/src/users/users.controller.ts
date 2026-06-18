import { Controller, Get, Post, Body, UseGuards, Request, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../utils/mail.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private prisma: PrismaService,
    private mailService: MailService
  ) {}

  @Get('premium-trials')
  async getPremiumTrials(@Request() req: any) {
    // Only allow admin (or primary user) to see this. We can assume the first user is admin or simply check.
    // For now, any authenticated user who is NOT a demo user and NOT a premium trial user.
    const user = await this.prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user || user.isPremiumTrial || user.email === 'demo@ipgenz.com') {
      throw new ForbiddenException('Admin only');
    }

    return this.prisma.user.findMany({
      where: { trialRequested: true },
      select: {
        id: true,
        email: true,
        isPremiumTrial: true,
        trialUsername: true,
        trialExpiry: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  @Post('premium-trials/generate')
  async generatePremiumTrial(@Request() req: any, @Body() body: { userId: string, masterProviderId: string }) {
    const admin = await this.prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!admin || admin.isPremiumTrial || admin.email === 'demo@ipgenz.com') {
      throw new ForbiddenException('Admin only');
    }

    const trialUser = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!trialUser) throw new NotFoundException('User not found');

    const masterProvider = await this.prisma.provider.findFirst({
      where: { id: body.masterProviderId, userId: admin.id }
    });
    if (!masterProvider) throw new NotFoundException('Master provider not found');

    // Generate 15 digit random username and password
    const trialUsername = Math.floor(100000000000000 + Math.random() * 900000000000000).toString();
    const trialPassword = Math.floor(100000000000000 + Math.random() * 900000000000000).toString();
    
    // 24 hours from now
    const trialExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Update the user
    await this.prisma.user.update({
      where: { id: trialUser.id },
      data: {
        isPremiumTrial: true,
        trialUsername,
        trialPassword,
        trialExpiry,
        assignedIp: null // Reset IP just in case
      }
    });

    // Create a default profile for the trial user
    await this.prisma.profile.create({
      data: {
        userId: trialUser.id,
        name: 'Trial User',
      }
    });

    // Create a copy of the provider for the trial user
    await this.prisma.provider.create({
      data: {
        userId: trialUser.id,
        providerName: 'Premium Trial',
        providerType: masterProvider.providerType,
        serverUrl: masterProvider.serverUrl,
        username: masterProvider.username,
        encryptedPassword: masterProvider.encryptedPassword,
        playlistUrl: masterProvider.playlistUrl,
        status: 'ACTIVE'
      }
    });

    // Automatically email the user the 1-day trial credentials
    if (trialUser.email) {
      await this.mailService.sendTrialCredentials(trialUser.email, trialUsername, trialPassword);
    }

    return { success: true, trialUsername, trialPassword, trialExpiry };
  }
}
