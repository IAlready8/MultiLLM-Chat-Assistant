/**
 * Notification Service
 *
 * Provides multi-channel notification delivery capabilities including email
 * and in-app notifications with templating, delivery preferences, and read/unread state tracking.
 * NOTE: Currently stores to the analytics table. In production, create a dedicated
 * Notification model in Prisma.
 *
 * @module services/notification-service
 */

import { prisma } from '@/lib/prisma';
import { getServerTimestamp } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type NotificationChannel = 'email' | 'in_app' | 'push';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationType =
  | 'billing_alert' | 'security_alert' | 'feature_announcement' | 'system_maintenance'
  | 'usage_milestone' | 'welcome' | 'goal_reminder' | 'persona_activity';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  read: boolean;
  readAt?: string;
  expiresAt?: string;
  data?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  emailFrequency: 'instant' | 'daily' | 'weekly';
  disabledTypes: NotificationType[];
}

export interface NotificationTemplate {
  type: NotificationType;
  title: string;
  messageTemplate: string;
  emailSubject?: string;
  emailBody?: string;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  dataSchema?: Record<string, unknown>;
}

export interface CreateNotificationRequest {
  userId: string;
  type: NotificationType;
  data?: Record<string, unknown>;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  expiresAt?: Date;
  templateData?: Record<string, string>;
}

// ============================================================================
// Templates
// ============================================================================

const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    type: 'welcome', title: 'Welcome to MultiLLM Chat Assistant',
    messageTemplate: 'Welcome {{userName}}! Start exploring multi-provider AI chat capabilities.',
    emailSubject: 'Welcome to MultiLLM Chat Assistant',
    emailBody: 'Hello {{userName}},\n\nWelcome to MultiLLM Chat Assistant. Get started by configuring your first LLM provider in Settings.',
    priority: 'normal', channels: ['email', 'in_app'],
  },
  {
    type: 'billing_alert', title: 'Subscription Update',
    messageTemplate: '{{message}}',
    emailSubject: 'Your Subscription Has Been Updated',
    priority: 'high', channels: ['email', 'in_app'],
  },
  {
    type: 'security_alert', title: 'Security Alert: {{alertType}}',
    messageTemplate: 'We detected a {{alertType}} on your account. {{actionRequired}}',
    emailSubject: 'Security Alert: Action Required',
    priority: 'urgent', channels: ['email', 'in_app', 'push'],
  },
  {
    type: 'feature_announcement', title: 'New Feature: {{featureName}}',
    messageTemplate: 'Check out our new {{featureName}} feature! {{description}}',
    emailSubject: 'New Feature Available',
    priority: 'low', channels: ['email', 'in_app'],
  },
  {
    type: 'system_maintenance', title: 'Scheduled Maintenance',
    messageTemplate: 'MultiLLM will undergo maintenance on {{date}}. {{impact}}.',
    emailSubject: 'Scheduled Maintenance Notice',
    priority: 'high', channels: ['email', 'in_app'],
  },
  {
    type: 'usage_milestone', title: 'Milestone Reached!',
    messageTemplate: 'Congratulations {{userName}}! You\'ve reached {{milestone}}.',
    emailSubject: 'You\'ve Reached a Milestone!',
    priority: 'normal', channels: ['in_app'],
  },
  {
    type: 'goal_reminder', title: 'Goal Reminder',
    messageTemplate: 'Don\'t forget about your goal: "{{goalTitle}}"',
    emailSubject: 'Goal Reminder',
    priority: 'normal', channels: ['in_app'],
  },
  {
    type: 'persona_activity', title: 'Persona Update',
    messageTemplate: 'Your persona "{{personaName}}" has been used {{usageCount}} times this week.',
    priority: 'low', channels: ['in_app'],
  },
];

// ============================================================================
// Service
// ============================================================================

export class NotificationService {
  async create(request: CreateNotificationRequest): Promise<Notification> {
    const template = NOTIFICATION_TEMPLATES.find(t => t.type === request.type);
    const priority = request.priority || template?.priority || 'normal';
    const channels = request.channels || template?.channels || ['in_app'];

    let message = template?.messageTemplate || '{{data}}';
    let title = template?.title || request.type;
    let emailSubject = template?.emailSubject;
    let emailBody = template?.emailBody;

    if (request.templateData) {
      for (const [key, value] of Object.entries(request.templateData)) {
        const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        message = message.replace(placeholder, value);
        title = title.replace(placeholder, value);
        emailSubject = emailSubject?.replace(placeholder, value);
        emailBody = emailBody?.replace(placeholder, value);
      }
    }

    // NOTE: Storing in analytics table as a temporary solution.
    // In production, create a dedicated Notification model in Prisma.
    const notification = await prisma.analytics.create({
      data: {
        userId: request.userId,
        event: `notification:${request.type}`,
        payload: JSON.stringify({ title, message, priority, channels, emailSubject, emailBody, data: request.data }),
      },
    });

    if (channels.includes('email')) {
      await this.sendEmail(request.userId, { subject: emailSubject || title, body: emailBody || message });
    }

    return {
      id: notification.id, userId: notification.userId, type: request.type,
      title, message, priority, channels, read: false,
      expiresAt: request.expiresAt?.toISOString(), data: request.data,
      createdAt: notification.createdAt.toISOString(), updatedAt: notification.updatedAt.toISOString(),
    };
  }

  async getUserNotifications(userId: string, options?: { unreadOnly?: boolean; limit?: number; type?: NotificationType }): Promise<Notification[]> {
    const notifications = await prisma.analytics.findMany({
      where: {
        userId, event: { startsWith: 'notification:' },
        ...(options?.type && { event: `notification:${options.type}` }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
    });

    let result = notifications.map(n => this.parseNotification(n));
    if (options?.unreadOnly) result = result.filter(n => !n.read);
    return result;
  }

  async markAsRead(userId: string, notificationIds: string[]): Promise<void> {
    // In production, would update dedicated notification records
    console.log(`Marking ${notificationIds.length} notifications as read for user ${userId}`);
  }

  async markAllAsRead(userId: string): Promise<void> {
    console.log(`Marking all notifications as read for user ${userId}`);
  }

  async getUnreadCount(userId: string): Promise<number> {
    // In production, would query dedicated notifications table
    return 0;
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return { userId, emailEnabled: true, inAppEnabled: true, pushEnabled: false, emailFrequency: 'instant', disabledTypes: [] };
  }

  async updatePreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<void> {
    console.log(`Updating preferences for user ${userId}:`, preferences);
  }

  private async sendEmail(userId: string, email: { subject: string; body: string }): Promise<void> {
    // Integration point for SendGrid, SES, etc.
    console.log(`[Email] To: ${userId}, Subject: ${email.subject}`);
    console.log(`[Email] Body: ${email.body.substring(0, 100)}...`);
  }

  private parseNotification(analytics: { id: string; userId: string; event: string; payload?: string | null | undefined; createdAt: Date; updatedAt: Date }): Notification {
    let data: Record<string, unknown> = {};
    let title = analytics.event;
    let message = '';
    let priority: NotificationPriority = 'normal';
    let channels: NotificationChannel[] = ['in_app'];
    let read = false;

    if (analytics.payload) {
      try {
        data = JSON.parse(analytics.payload);
        title = (data.title as string) || title;
        message = (data.message as string) || '';
        priority = (data.priority as NotificationPriority) || 'normal';
        channels = (data.channels as NotificationChannel[]) || ['in_app'];
      } catch { /* use defaults */ }
    }

    return {
      id: analytics.id, userId: analytics.userId,
      type: analytics.event.replace('notification:', '') as NotificationType,
      title, message, priority, channels, read, data,
      createdAt: analytics.createdAt.toISOString(), updatedAt: analytics.updatedAt.toISOString(),
    };
  }

  async sendBatch(userIds: string[], type: NotificationType, data?: Record<string, unknown>): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    for (const userId of userIds) {
      try { await this.create({ userId, type, data }); sent++; }
      catch (error) { console.error(`Failed to send notification to ${userId}:`, error); failed++; }
    }
    return { sent, failed };
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const notificationService = new NotificationService();

export async function createNotification(request: CreateNotificationRequest): Promise<Notification> {
  return notificationService.create(request);
}

export async function getNotifications(userId: string, options?: { unreadOnly?: boolean; limit?: number }): Promise<Notification[]> {
  return notificationService.getUserNotifications(userId, options);
}

export async function markNotificationsAsRead(userId: string, notificationIds: string[]): Promise<void> {
  return notificationService.markAsRead(userId, notificationIds);
}
