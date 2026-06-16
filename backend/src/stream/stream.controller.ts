import { Controller, Get, Param, Query, Res, UseGuards, Request } from '@nestjs/common';
import { StreamService } from './stream.service';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

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
  ) {
    const trackNum = audioTrack !== undefined && audioTrack !== '' ? parseInt(audioTrack, 10) : undefined;
    return this.streamService.proxyLiveStream(channelId, trackNum, req.user.userId, res);
  }

  @Get('live/:channelId/info')
  async getLiveChannelInfo(@Request() req: any, @Param('channelId') channelId: string) {
    return this.streamService.getLiveStreamInfo(channelId, req.user.userId);
  }


  @Get('movie/:movieId')
  async streamMovie(
    @Request() req: any,
    @Param('movieId') movieId: string,
    @Res() res: Response,
    @Query('audioTrack') audioTrack?: string,
    @Query('start') start?: string,
  ) {
    const trackNum = audioTrack !== undefined && audioTrack !== '' ? parseInt(audioTrack, 10) : undefined;
    const startNum = start !== undefined && start !== '' ? parseFloat(start) : undefined;
    return this.streamService.proxyMovieStream(movieId, req.user.userId, res, trackNum, startNum);
  }

  @Get('movie/:movieId/info')
  async getMovieStreamInfo(@Request() req: any, @Param('movieId') movieId: string) {
    return this.streamService.getMovieStreamInfo(movieId, req.user.userId);
  }

  @Get('episode/:episodeId')
  async streamEpisode(
    @Request() req: any,
    @Param('episodeId') episodeId: string,
    @Res() res: Response,
    @Query('audioTrack') audioTrack?: string,
    @Query('start') start?: string,
  ) {
    const trackNum = audioTrack !== undefined && audioTrack !== '' ? parseInt(audioTrack, 10) : undefined;
    const startNum = start !== undefined && start !== '' ? parseFloat(start) : undefined;
    return this.streamService.proxyEpisodeStream(episodeId, req.user.userId, res, trackNum, startNum);
  }

  @Get('episode/:episodeId/info')
  async getEpisodeStreamInfo(@Request() req: any, @Param('episodeId') episodeId: string) {
    return this.streamService.getEpisodeStreamInfo(episodeId, req.user.userId);
  }

  @Get('download/movie/:movieId')
  async downloadMovie(
    @Request() req: any,
    @Param('movieId') movieId: string,
    @Res() res: Response,
  ) {
    return this.streamService.proxyDownloadMovie(movieId, req.user.userId, res);
  }

  @Get('download/episode/:episodeId')
  async downloadEpisode(
    @Request() req: any,
    @Param('episodeId') episodeId: string,
    @Res() res: Response,
  ) {
    return this.streamService.proxyDownloadEpisode(episodeId, req.user.userId, res);
  }
}
