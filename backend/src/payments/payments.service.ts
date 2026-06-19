// Refresh diagnostics
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../utils/mail.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async submitPaymentRequest(data: {
    userEmail: string;
    userName: string;
    plan: string;
    amount: number;
    upiRef?: string;
    screenshotB64: string;
  }) {
    const request = await this.prisma.paymentRequest.create({ data });

    // Send alert email to admin
    await this.mailService.sendPaymentAlert(request).catch((e) => {
      console.error('Failed to send payment alert email:', e.message);
    });

    return { success: true, id: request.id };
  }

  async getAllRequests() {
    return this.prisma.paymentRequest.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveRequest(id: string, adminNotes?: string) {
    const request = await this.prisma.paymentRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Payment request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Payment request has already been processed');
    }

    // Fetch the Master Trial Provider to copy configs for streaming access
    const masterProvider = await this.prisma.trialProvider.findFirst();

    // Generate 15-digit random numeric credentials
    const trialUsername = Math.floor(100000000000000 + Math.random() * 900000000000000).toString();
    const trialPassword = Math.floor(100000000000000 + Math.random() * 900000000000000).toString();

    // Determine plan duration and set expiry
    let trialExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default
    const planLower = request.plan.toLowerCase();
    if (planLower.includes('day') || planLower.includes('daily') || planLower.includes('pass')) {
      trialExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day
    } else if (planLower.includes('year') || planLower.includes('yearly')) {
      trialExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 365 days
    } else if (planLower.includes('month') || planLower.includes('monthly')) {
      trialExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    }

    // Check if user already exists
    let user = await this.prisma.user.findUnique({
      where: { email: request.userEmail },
    });

    if (user) {
      // Update existing user with premium active status and numeric login credentials
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          isPremiumTrial: true,
          trialRequested: true,
          trialUsername,
          trialPassword,
          trialExpiry,
          assignedIp: null, // Allow login from new IP
        },
      });
    } else {
      // Create new user with premium active status and numeric login credentials
      user = await this.prisma.user.create({
        data: {
          email: request.userEmail,
          isPremiumTrial: true,
          trialRequested: true,
          trialUsername,
          trialPassword,
          trialExpiry,
        },
      });

      // Create a default Profile
      await this.prisma.profile.create({
        data: {
          userId: user.id,
          name: request.userName || 'Member',
        },
      });
    }

    // Setup active IPTV provider for the user
    if (masterProvider) {
      const existingProvider = await this.prisma.provider.findFirst({
        where: { userId: user.id },
      });
      if (!existingProvider) {
        await this.prisma.provider.create({
          data: {
            userId: user.id,
            providerName: 'Premium Active',
            providerType: masterProvider.providerType,
            serverUrl: masterProvider.serverUrl,
            username: masterProvider.username,
            encryptedPassword: masterProvider.encryptedPassword,
            playlistUrl: masterProvider.playlistUrl,
            status: 'ACTIVE',
          },
        });
      } else {
        // Ensure status is active
        await this.prisma.provider.update({
          where: { id: existingProvider.id },
          data: { status: 'ACTIVE' },
        });
      }
    }

    // Update payment request status to APPROVED
    const updatedRequest = await this.prisma.paymentRequest.update({
      where: { id },
      data: { status: 'APPROVED', adminNotes },
    });

    // Send the email with invoice and 15-digit credentials
    await this.mailService.sendPaymentApprovalReceipt(
      request.userEmail,
      request.userName,
      request.plan,
      request.amount,
      request.id,
      trialUsername,
      trialPassword,
    );

    return updatedRequest;
  }

  async rejectRequest(id: string, adminNotes?: string) {
    const request = await this.prisma.paymentRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Payment request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Payment request has already been processed');
    }

    return this.prisma.paymentRequest.update({
      where: { id },
      data: { status: 'REJECTED', adminNotes },
    });
  }
}
