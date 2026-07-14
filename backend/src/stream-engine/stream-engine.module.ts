import { Module } from '@nestjs/common';
import { StreamEngineController } from './stream-engine.controller';
import { StreamEngineService } from './stream-engine.service';
import { FfprobeService } from './ffprobe.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [StreamEngineController],
  providers: [StreamEngineService, FfprobeService],
  exports: [StreamEngineService],
})
export class StreamEngineModule {}
