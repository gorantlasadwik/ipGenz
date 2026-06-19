// Refresh diagnostics
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService implements OnModuleInit {
  public static trialMasterUserId: string | null = null;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Seed Demo User
    const demoEmail = 'demo@ipgenz.com';
    let demoUser = await this.findOne(demoEmail);
    if (!demoUser) {
      const salt = await bcrypt.genSalt();
      const passwordHash = await bcrypt.hash('DemoAppSecret123!', salt);
      demoUser = await this.prisma.user.create({
        data: {
          email: demoEmail,
          passwordHash,
        }
      });
      console.log('Seeded demo user: demo@ipgenz.com');
    }

    // Ensure Demo user has a profile
    const demoProfile = await this.prisma.profile.findFirst({
      where: { userId: demoUser.id }
    });
    if (!demoProfile) {
      await this.prisma.profile.create({
        data: {
          userId: demoUser.id,
          name: 'Demo Visitor',
        }
      });
      console.log('Seeded demo profile for demo user.');
    }

    // Seed Trial Master User
    const trialMasterEmail = 'trial_master@ipgenz.com';
    let trialMasterUser = await this.findOne(trialMasterEmail);
    if (!trialMasterUser) {
      const salt = await bcrypt.genSalt();
      const passwordHash = await bcrypt.hash('TrialMasterAppSecret123!', salt);
      trialMasterUser = await this.prisma.user.create({
        data: {
          email: trialMasterEmail,
          passwordHash,
        }
      });
      console.log('Seeded trial master user: trial_master@ipgenz.com');
    }
    UsersService.trialMasterUserId = trialMasterUser.id;

    // Ensure Trial Master user has a profile
    const trialMasterProfile = await this.prisma.profile.findFirst({
      where: { userId: trialMasterUser.id }
    });
    if (!trialMasterProfile) {
      await this.prisma.profile.create({
        data: {
          userId: trialMasterUser.id,
          name: 'Trial Master',
        }
      });
      console.log('Seeded trial master profile for trial master user.');
    }
  }

  async findOne(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data,
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async findByTrialUsername(trialUsername: string) {
    return this.prisma.user.findUnique({
      where: { trialUsername } as any,
    });
  }

  async updateAssignedIp(id: string, assignedIp: string) {
    return this.prisma.user.update({
      where: { id },
      data: { assignedIp } as any,
    });
  }
}
