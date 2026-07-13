import { Controller, Get, Param, Query, Res, UseGuards, Request } from '@nestjs/common';
import { StreamService } from './stream.service';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from '../users/users.service';

@Controller('stream')
@UseGuards(JwtAuthGuard)
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  @Get('live/:channelId')
  async streamLiveChannel(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Res() res: Response,
    @Query('audioTrack') audioTrack?: string,
    @Query('transcode') transcode?: string,
  ) {
    const trackNum = audioTrack !== undefined && audioTrack !== '' ? parseInt(audioTrack, 10) : undefined;
    const targetUserId = req.user.isPremiumTrial ? (UsersService.trialMasterUserId || req.user.userId) : req.user.userId;
    return this.streamService.proxyLiveStream(channelId, trackNum, targetUserId, res, transcode, req);
  }

  @Get('live/:channelId/playlist.m3u8')
  async getHlsPlaylist(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const targetUserId = req.user.isPremiumTrial ? (UsersService.trialMasterUserId || req.user.userId) : req.user.userId;
    return this.streamService.getHlsPlaylist(channelId, targetUserId, token, res);
  }

  @Get('live/:channelId/:segmentName')
  async getHlsSegment(
    @Param('channelId') channelId: string,
    @Param('segmentName') segmentName: string,
    @Res() res: Response,
  ) {
    return this.streamService.getHlsSegment(channelId, segmentName, res);
  }

  @Get('live/:channelId/info')
  async getLiveChannelInfo(@Request() req: any, @Param('channelId') channelId: string) {
    const targetUserId = req.user.isPremiumTrial ? (UsersService.trialMasterUserId || req.user.userId) : req.user.userId;
    return this.streamService.getLiveStreamInfo(channelId, targetUserId);
  }

  @Get('movie/:movieId')
  async streamMovie(
    @Request() req: any,
    @Param('movieId') movieId: string,
    @Res() res: Response,
    @Query('audioTrack') audioTrack?: string,
    @Query('start') start?: string,
    @Query('transcode') transcode?: string,
  ) {
    const trackNum = audioTrack !== undefined && audioTrack !== '' ? parseInt(audioTrack, 10) : undefined;
    const startNum = start !== undefined && start !== '' ? parseFloat(start) : undefined;
    const targetUserId = req.user.isPremiumTrial ? (UsersService.trialMasterUserId || req.user.userId) : req.user.userId;
    return this.streamService.proxyMovieStream(req, movieId, targetUserId, res, trackNum, startNum, transcode);
  }

  @Get('movie/:movieId/info')
  async getMovieStreamInfo(@Request() req: any, @Param('movieId') movieId: string) {
    const targetUserId = req.user.isPremiumTrial ? (UsersService.trialMasterUserId || req.user.userId) : req.user.userId;
    return this.streamService.getMovieStreamInfo(movieId, targetUserId);
  }

  @Get('episode/:episodeId')
  async streamEpisode(
    @Request() req: any,
    @Param('episodeId') episodeId: string,
    @Res() res: Response,
    @Query('audioTrack') audioTrack?: string,
    @Query('start') start?: string,
    @Query('transcode') transcode?: string,
  ) {
    const trackNum = audioTrack !== undefined && audioTrack !== '' ? parseInt(audioTrack, 10) : undefined;
    const startNum = start !== undefined && start !== '' ? parseFloat(start) : undefined;
    const targetUserId = req.user.isPremiumTrial ? (UsersService.trialMasterUserId || req.user.userId) : req.user.userId;
    return this.streamService.proxyEpisodeStream(req, episodeId, targetUserId, res, trackNum, startNum, transcode);
  }

  @Get('episode/:episodeId/info')
  async getEpisodeStreamInfo(@Request() req: any, @Param('episodeId') episodeId: string) {
    const targetUserId = req.user.isPremiumTrial ? (UsersService.trialMasterUserId || req.user.userId) : req.user.userId;
    return this.streamService.getEpisodeStreamInfo(episodeId, targetUserId);
  }

  @Get('download/check-limit')
  async checkDownloadLimit(@Request() req: any) {
    await this.streamService.validateDownloadLimitOnly(req.user.userId);
    return { allowed: true };
  }

  @Get('download/movie/:movieId')
  async downloadMovie(
    @Request() req: any,
    @Param('movieId') movieId: string,
    @Res() res: Response,
  ) {
    const targetUserId = req.user.isPremiumTrial ? (UsersService.trialMasterUserId || req.user.userId) : req.user.userId;
    return this.streamService.proxyDownloadMovie(movieId, req.user.userId, targetUserId, res);
  }

  @Get('download/episode/:episodeId')
  async downloadEpisode(
    @Request() req: any,
    @Param('episodeId') episodeId: string,
    @Res() res: Response,
  ) {
    const targetUserId = req.user.isPremiumTrial ? (UsersService.trialMasterUserId || req.user.userId) : req.user.userId;
    return this.streamService.proxyDownloadEpisode(episodeId, req.user.userId, targetUserId, res);
  }
}
