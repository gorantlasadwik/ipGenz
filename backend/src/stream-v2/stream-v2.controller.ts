import { Controller, Get, Param, Query, Res, UseGuards, Request } from '@nestjs/common';
import { StreamV2Service } from './stream-v2.service';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from '../users/users.service';

@Controller('stream-v2')
@UseGuards(JwtAuthGuard)
export class StreamV2Controller {
  constructor(private readonly streamV2Service: StreamV2Service) {}

  @Get('live/:channelId')
  async streamLiveChannel(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Res() res: Response,
    @Query('audioTrack') audioTrack?: string,
    @Query('transcode') transcode?: string,
  ) {
    const targetUserId = req.user.isPremiumTrial ? (UsersService.trialMasterUserId || req.user.userId) : req.user.userId;
    return this.streamV2Service.attachViewer(channelId, targetUserId, res, req, { audioTrack, transcode });
  }

  @Get('live/:channelId/info')
  async getLiveChannelInfo(
    @Request() req: any,
    @Param('channelId') channelId: string,
  ) {
    const targetUserId = req.user.isPremiumTrial ? (UsersService.trialMasterUserId || req.user.userId) : req.user.userId;
    return this.streamV2Service.getLiveStreamInfo(channelId, targetUserId);
  }
}
