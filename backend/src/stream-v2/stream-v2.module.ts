import { Module } from '@nestjs/common';
import { StreamV2Service } from './stream-v2.service';
import { StreamV2Controller } from './stream-v2.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [StreamV2Service],
  controllers: [StreamV2Controller],
  exports: [StreamV2Service],
})
export class StreamV2Module {}
