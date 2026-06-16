import { Module } from '@nestjs/common';
import { StreamService } from './stream.service';
import { StreamController } from './stream.controller';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { CodecService } from './codec.service';

@Module({
  imports: [HttpModule, PrismaModule],
  providers: [StreamService, CodecService],
  controllers: [StreamController],
  exports: [StreamService, CodecService],
})
export class StreamModule {}
