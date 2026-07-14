/**
 * Stream Engine Controller — v7
 *
 * Routes:
 *   GET /stream-engine/live/:channelId          → streams MPEG-TS to client
 *   GET /stream-engine/live/:channelId/info      → returns StreamProfile JSON
 *   GET /stream-engine/health                    → worker health (dev/debug)
 */

import { Controller, Get, Param, Res, UseGuards, Request } from '@nestjs/common';
import { StreamEngineService } from './stream-engine.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Response } from 'express';

@Controller('stream-engine')
@UseGuards(JwtAuthGuard)
export class StreamEngineController {
  constructor(private readonly streamEngine: StreamEngineService) {}

  /**
   * Main live stream endpoint.
   * Streams MPEG-TS with monotonic timestamps directly to the client.
   * Auth via Bearer token OR ?token= query param (for mpegts.js).
   */
  @Get('live/:channelId')
  async streamLive(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Res() res: Response,
  ) {
    const userId = req.user.isPremiumTrial
      ? (UsersService.trialMasterUserId || req.user.userId)
      : req.user.userId;

    return this.streamEngine.attachViewer(channelId, userId, res, req);
  }

  /**
   * Stream metadata endpoint.
   * Returns video codec, audio tracks, subtitle tracks.
   * Client uses this to determine decode path before starting playback.
   */
  @Get('live/:channelId/info')
  async getStreamInfo(
    @Request() req: any,
    @Param('channelId') channelId: string,
  ) {
    const userId = req.user.isPremiumTrial
      ? (UsersService.trialMasterUserId || req.user.userId)
      : req.user.userId;

    return this.streamEngine.getStreamInfo(channelId, userId);
  }

  /**
   * Worker health endpoint for observability.
   */
  @Get('health')
  getHealth() {
    return this.streamEngine.getWorkerHealth();
  }
}
