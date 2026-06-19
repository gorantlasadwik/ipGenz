import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../utils/mail.service';

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
    return this.prisma.paymentRequest.update({
      where: { id },
      data: { status: 'APPROVED', adminNotes },
    });
  }

  async rejectRequest(id: string, adminNotes?: string) {
    return this.prisma.paymentRequest.update({
      where: { id },
      data: { status: 'REJECTED', adminNotes },
    });
  }
}
