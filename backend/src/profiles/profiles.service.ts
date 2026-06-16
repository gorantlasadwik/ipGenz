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
    const profiles = await this.prisma.profile.findMany({
      where: { userId }
    });
    return profiles.map(p => {
      const { pin, ...rest } = p;
      return { ...rest, hasPin: !!pin };
    });
  }

  async updateProfile(userId: string, profileId: string, data: { pin: string | null }) {
    const profile = await this.prisma.profile.findFirst({ where: { id: profileId, userId } });
    if (!profile) throw new BadRequestException('Profile not found');
    
    const updated = await this.prisma.profile.update({
      where: { id: profileId },
      data: { pin: data.pin }
    });
    const { pin, ...rest } = updated;
    return { ...rest, hasPin: !!pin };
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
