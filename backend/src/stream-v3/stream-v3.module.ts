import { Module } from '@nestjs/common';
import { StreamV3Service } from './stream-v3.service';
import { StreamV3Controller } from './stream-v3.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [StreamV3Service],
  controllers: [StreamV3Controller],
  exports: [StreamV3Service],
})
export class StreamV3Module {}
