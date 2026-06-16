import { Controller, Post, Body, Get, Put, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProfileType } from '@prisma/client';

@Controller('profiles')
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Post()
  async createProfile(@Request() req: any, @Body() body: { name: string, profileType: ProfileType, pin?: string, avatar?: string }) {
    if (req.user.email === 'demo@ipgenz.com') {
      throw new ForbiddenException('Demo users cannot create profiles');
    }
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

  @Put(':id')
  async updateProfile(@Request() req: any, @Param('id') id: string, @Body() body: { pin: string | null }) {
    if (req.user.email === 'demo@ipgenz.com') {
      throw new ForbiddenException('Demo users cannot lock profiles');
    }
    return this.profilesService.updateProfile(req.user.userId, id, body);
  }
}
