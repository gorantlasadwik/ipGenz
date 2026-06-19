import { Module } from '@nestjs/common';
import { ObservabilityService } from './observability.service';
import { SadwikController } from './sadwik.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StreamModule } from '../stream/stream.module';
import { PaymentsModule } from '../payments/payments.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, StreamModule, PaymentsModule, UsersModule],
  controllers: [SadwikController],
  providers: [ObservabilityService],
  exports: [ObservabilityService]
})
export class ObservabilityModule {}
