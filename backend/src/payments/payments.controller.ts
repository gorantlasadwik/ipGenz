import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('submit')
  async submitPayment(@Body() body: any) {
    if (!body.userEmail || !body.userName || !body.plan || !body.amount || !body.screenshotB64) {
      throw new BadRequestException('Missing required fields');
    }
    return this.paymentsService.submitPaymentRequest({
      userEmail: body.userEmail,
      userName: body.userName,
      plan: body.plan,
      amount: body.amount,
      upiRef: body.upiRef,
      screenshotB64: body.screenshotB64,
    });
  }
}
