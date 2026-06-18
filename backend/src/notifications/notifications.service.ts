import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async getNotifications(profileId: string) {
    // 1. Get all notifications
    const allNotifications = await this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // 2. Get user's read status for these notifications
    const userNotifications = await this.prisma.userNotification.findMany({
      where: { profileId, notificationId: { in: allNotifications.map(n => n.id) } },
    });

    const readSet = new Set(userNotifications.filter(un => un.isRead).map(un => un.notificationId));

    // 3. Map to DTO
    return allNotifications.map(n => ({
      ...n,
      isRead: readSet.has(n.id)
    }));
  }

  async markAsRead(profileId: string, notificationId: string) {
    return this.prisma.userNotification.upsert({
      where: { profileId_notificationId: { profileId, notificationId } },
      create: { profileId, notificationId, isRead: true },
      update: { isRead: true }
    });
  }

  async markAllAsRead(profileId: string) {
    const allNotifications = await this.prisma.notification.findMany({ select: { id: true } });
    
    // Create or update all
    const operations = allNotifications.map(n => 
      this.prisma.userNotification.upsert({
        where: { profileId_notificationId: { profileId, notificationId: n.id } },
        create: { profileId, notificationId: n.id, isRead: true },
        update: { isRead: true }
      })
    );

    await this.prisma.$transaction(operations);
    return { success: true };
  }

  // Admin method to push notification
  async pushNotification(title: string, message: string, type: string = 'INFO', link?: string) {
    return this.prisma.notification.create({
      data: {
        title,
        message,
        type,
        link
      }
    });
  }
}
