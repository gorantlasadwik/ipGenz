import { Controller, Get, Param, Query, Res, UseGuards, Request } from '@nestjs/common';
import { StreamV3Service } from './stream-v3.service';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from '../users/users.service';

@Controller('stream-v3')
@UseGuards(JwtAuthGuard)
export class StreamV3Controller {
  constructor(private readonly streamV3Service: StreamV3Service) {}

  @Get('live/:channelId')
  async streamLiveChannel(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Res() res: Response,
    @Query('viewerId') viewerId?: string,
  ) {
    const targetUserId = req.user.isPremiumTrial ? (UsersService.trialMasterUserId || req.user.userId) : req.user.userId;
    return this.streamV3Service.attachViewer(channelId, targetUserId, res, req, { viewerId });
  }

  @Get('live/:channelId/info')
  async getLiveChannelInfo(
    @Request() req: any,
    @Param('channelId') channelId: string,
  ) {
    const targetUserId = req.user.isPremiumTrial ? (UsersService.trialMasterUserId || req.user.userId) : req.user.userId;
    return this.streamV3Service.getLiveStreamInfo(channelId, targetUserId);
  }
}
