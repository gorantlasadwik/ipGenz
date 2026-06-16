import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LibraryController],
})
export class LibraryModule {}
