import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MailService } from '../utils/mail.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, MailService],
  exports: [UsersService, MailService],
})
export class UsersModule {}
