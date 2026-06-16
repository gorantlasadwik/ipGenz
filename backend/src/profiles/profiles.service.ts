import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileType } from '@prisma/client';

@Injectable()
export class ProfilesService {
  constructor(private prisma: PrismaService) {}

  async createProfile(userId: string, data: { name: string, profileType: ProfileType, pin?: string, avatar?: string }) {
    if (data.profileType === ProfileType.CHILD && !data.pin) {
      throw new BadRequestException('Child profiles must have a PIN lock.');
    }

    return this.prisma.profile.create({
      data: {
        userId,
        name: data.name,
        profileType: data.profileType,
        pin: data.pin || null,
        avatar: data.avatar || null,
      }
    });
  }

  async getProfiles(userId: string) {
    return this.prisma.profile.findMany({
      where: { userId }
    });
  }

  async verifyPin(profileId: string, pin: string) {
    const profile = await this.prisma.profile.findUnique({ where: { id: profileId } });
    if (!profile) throw new BadRequestException('Profile not found');
    
    if (profile.pin && profile.pin !== pin) {
      return false;
    }
    return true;
  }
}
