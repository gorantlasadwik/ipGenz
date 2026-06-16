import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProvidersModule } from '../providers/providers.module';
import { MetadataModule } from '../metadata/metadata.module';
import { ObservabilityModule } from '../observability/observability.module';

@Module({
  imports: [PrismaModule, ProvidersModule, MetadataModule, ObservabilityModule],
  controllers: [SyncController],
  providers: [SyncService]
})
export class SyncModule {}

