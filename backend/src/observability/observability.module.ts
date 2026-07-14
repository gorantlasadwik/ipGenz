import { Module } from '@nestjs/common';
import { ObservabilityService } from './observability.service';
import { SadwikController } from './sadwik.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { UsersModule } from '../users/users.module';
import { StreamEngineModule } from '../stream-engine/stream-engine.module';

@Module({
  imports: [PrismaModule, StreamEngineModule, PaymentsModule, UsersModule],
  controllers: [SadwikController],
  providers: [ObservabilityService],
  exports: [ObservabilityService]
})
export class ObservabilityModule {}
