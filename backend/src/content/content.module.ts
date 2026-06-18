import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentService } from './content.service';

@Module({
  imports: [PrismaModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
