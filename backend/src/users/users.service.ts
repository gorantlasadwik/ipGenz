import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService implements OnModuleInit {
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
      where: { trialUsername },
    });
  }

  async updateAssignedIp(id: string, assignedIp: string) {
    return this.prisma.user.update({
      where: { id },
      data: { assignedIp },
    });
  }
}
