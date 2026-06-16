import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProfileType } from '@prisma/client';

@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Post()
  async createProfile(@Request() req: any, @Body() body: { name: string, profileType: ProfileType, pin?: string, avatar?: string }) {
    return this.profilesService.createProfile(req.user.userId, body);
  }

  @Get()
  async getProfiles(@Request() req: any) {
    return this.profilesService.getProfiles(req.user.userId);
  }

  @Post('verify-pin')
  async verifyPin(@Body() body: { profileId: string, pin: string }) {
    const isValid = await this.profilesService.verifyPin(body.profileId, body.pin);
    return { valid: isValid };
  }
}
