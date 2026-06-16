import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ContentController],
})
export class ContentModule {}
