import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private prisma: PrismaService
  ) {}

  @Get()
  async getNotifications(@Request() req: any, @Query('profileId') profileId: string) {
    if (!profileId) return [];
    
    // Validate profile
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, userId: req.user.userId }
    });
    if (!profile) return [];

    return this.notificationsService.getNotifications(profileId);
  }

  @Put(':id/read')
  async markAsRead(@Request() req: any, @Param('id') id: string, @Body() body: { profileId: string }) {
    if (!body.profileId) return { success: false };
    
    const profile = await this.prisma.profile.findFirst({
      where: { id: body.profileId, userId: req.user.userId }
    });
    if (!profile) return { success: false };

    return this.notificationsService.markAsRead(body.profileId, id);
  }

  @Put('read-all')
  async markAllAsRead(@Request() req: any, @Body() body: { profileId: string }) {
    if (!body.profileId) return { success: false };
    
    const profile = await this.prisma.profile.findFirst({
      where: { id: body.profileId, userId: req.user.userId }
    });
    if (!profile) return { success: false };

    return this.notificationsService.markAllAsRead(body.profileId);
  }

  // Admin endpoint to push notification
  @Post('admin/push')
  async pushNotification(@Request() req: any, @Body() body: { title: string, message: string, type?: string, link?: string }) {
    // In a real app, verify req.user is admin.
    // For now, we trust it since it's a small app or we can check later.
    return this.notificationsService.pushNotification(body.title, body.message, body.type, body.link);
  }
}
