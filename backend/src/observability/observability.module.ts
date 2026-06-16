import { Module } from '@nestjs/common';
import { ObservabilityService } from './observability.service';
import { SadwikController } from './sadwik.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StreamModule } from '../stream/stream.module';

@Module({
  imports: [PrismaModule, StreamModule],
  controllers: [SadwikController],
  providers: [ObservabilityService],
  exports: [ObservabilityService]
})
export class ObservabilityModule {}
