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

    // Check if user already exists
    let user = await this.prisma.user.findUnique({
      where: { email: request.userEmail },
    });

    let generatedPassword: string | null = null;

    if (!user) {
      // Create user
      // Generate a readable random password (alphanumeric, 10 characters)
      generatedPassword = Math.random().toString(36).slice(-8) + Math.floor(10 + Math.random() * 90);
      const salt = await bcrypt.genSalt();
      const passwordHash = await bcrypt.hash(generatedPassword, salt);

      user = await this.prisma.user.create({
        data: {
          email: request.userEmail,
          passwordHash,
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

    // Update payment request status to APPROVED
    const updatedRequest = await this.prisma.paymentRequest.update({
      where: { id },
      data: { status: 'APPROVED', adminNotes },
    });

    // Send the email with invoice and login credentials
    await this.mailService.sendPaymentApprovalReceipt(
      request.userEmail,
      request.userName,
      request.plan,
      request.amount,
      request.id,
      generatedPassword,
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
