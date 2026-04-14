/**
 * Audit Log Service
 *
 * Provides a comprehensive audit trail for compliance and security purposes.
 * Tracks all administrative actions, data access, and significant system events.
 * NOTE: Currently stores to the analytics table. In production, use a dedicated
 * audit log table or external service (e.g., Datadog Audit, AWS CloudTrail).
 *
 * @module services/audit-log-service
 */

import { prisma } from '@/lib/prisma';
import { getServerTimestamp } from '@/lib/utils';
import { NextRequest } from 'next/server';

// ============================================================================
// Types
// ============================================================================

export type AuditCategory =
  | 'authentication' | 'authorization' | 'data_access' | 'data_modification'
  | 'admin_action' | 'billing' | 'api_usage' | 'security' | 'system';

export type AuditAction =
  | 'login' | 'logout' | 'login_failed' | 'password_changed' | 'password_reset_requested' | 'mfa_enabled' | 'mfa_disabled'
  | 'permission_granted' | 'permission_revoked' | 'role_changed'
  | 'conversation_viewed' | 'persona_viewed' | 'goal_viewed' | 'config_viewed' | 'export_requested'
  | 'conversation_created' | 'conversation_updated' | 'conversation_deleted' | 'message_added'
  | 'persona_created' | 'persona_updated' | 'persona_deleted'
  | 'goal_created' | 'goal_updated' | 'goal_completed' | 'goal_deleted'
  | 'api_key_created' | 'api_key_deleted' | 'api_key_used'
  | 'user_created' | 'user_updated' | 'user_deleted' | 'settings_changed' | 'feature_flag_changed'
  | 'subscription_created' | 'subscription_updated' | 'subscription_cancelled' | 'payment_processed' | 'payment_failed'
  | 'suspicious_activity' | 'rate_limit_exceeded' | 'invalid_api_key' | 'session_expired'
  | 'backup_created' | 'backup_restored' | 'migration_applied';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId?: string;
  userEmail?: string;
  category: AuditCategory;
  action: AuditAction;
  resource?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failure' | 'pending';
  statusMessage?: string;
  requestMethod?: string;
  requestPath?: string;
  requestBody?: Record<string, unknown>;
  responseCode?: number;
  metadata?: Record<string, unknown>;
  sessionId?: string;
}

export interface AuditLogQuery {
  userId?: string;
  category?: AuditCategory;
  action?: AuditAction;
  startDate?: Date;
  endDate?: Date;
  resource?: string;
  status?: 'success' | 'failure';
  limit?: number;
  offset?: number;
}

export interface AuditSummary {
  totalEvents: number;
  byCategory: Record<AuditCategory, number>;
  byAction: Record<AuditAction, number>;
  byStatus: Record<string, number>;
  uniqueUsers: number;
  suspiciousEvents: number;
  dateRange: { start: string; end: string };
}

const ACTION_TO_CATEGORY: Record<AuditAction, AuditCategory> = {
  login: 'authentication', logout: 'authentication', login_failed: 'authentication',
  password_changed: 'authentication', password_reset_requested: 'authentication',
  mfa_enabled: 'authentication', mfa_disabled: 'authentication',
  permission_granted: 'authorization', permission_revoked: 'authorization', role_changed: 'authorization',
  conversation_viewed: 'data_access', persona_viewed: 'data_access', goal_viewed: 'data_access',
  config_viewed: 'data_access', export_requested: 'data_access',
  conversation_created: 'data_modification', conversation_updated: 'data_modification',
  conversation_deleted: 'data_modification', message_added: 'data_modification',
  persona_created: 'data_modification', persona_updated: 'data_modification', persona_deleted: 'data_modification',
  goal_created: 'data_modification', goal_updated: 'data_modification', goal_completed: 'data_modification',
  goal_deleted: 'data_modification', api_key_created: 'data_modification',
  api_key_deleted: 'data_modification', api_key_used: 'data_modification',
  user_created: 'admin_action', user_updated: 'admin_action', user_deleted: 'admin_action',
  settings_changed: 'admin_action', feature_flag_changed: 'admin_action',
  subscription_created: 'billing', subscription_updated: 'billing', subscription_cancelled: 'billing',
  payment_processed: 'billing', payment_failed: 'billing',
  suspicious_activity: 'security', rate_limit_exceeded: 'security',
  invalid_api_key: 'security', session_expired: 'security',
  backup_created: 'system', backup_restored: 'system', migration_applied: 'system',
};

// ============================================================================
// Service
// ============================================================================

export class AuditLogService {
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const logEntry: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: getServerTimestamp(),
      ...entry,
      category: entry.category || ACTION_TO_CATEGORY[entry.action] || 'system',
    };

    // NOTE: Storing in analytics table as a temporary solution.
    // In production, create a dedicated AuditLog model in Prisma.
    await prisma.analytics.create({
      data: {
        userId: entry.userId || 'system',
        event: `audit:${entry.action}`,
        payload: JSON.stringify({ ...logEntry, requestBody: this.sanitizeData(entry.requestBody) }),
      },
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`[AUDIT] ${logEntry.timestamp} [${logEntry.category}] ${logEntry.action} by ${logEntry.userId || 'system'}`);
    }

    return logEntry;
  }

  async query(options: AuditLogQuery): Promise<AuditLogEntry[]> {
    const entries = await prisma.analytics.findMany({
      where: {
        event: { startsWith: 'audit:' },
        ...(options.userId && { userId: options.userId }),
        ...(options.startDate && { createdAt: { gte: options.startDate } }),
        ...(options.endDate && { createdAt: { lte: options.endDate } }),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit || 100,
      skip: options.offset || 0,
    });

    return entries.map(this.parseEntry).filter(entry => {
      if (options.category && entry.category !== options.category) return false;
      if (options.action && entry.action !== options.action) return false;
      if (options.resource && entry.resource !== options.resource) return false;
      if (options.status && entry.status !== options.status) return false;
      return true;
    });
  }

  async getSummary(startDate: Date, endDate: Date): Promise<AuditSummary> {
    const entries = await this.query({ startDate, endDate, limit: 10000 });
    const byCategory: Record<AuditCategory, number> = {
      authentication: 0, authorization: 0, data_access: 0, data_modification: 0,
      admin_action: 0, billing: 0, api_usage: 0, security: 0, system: 0,
    };
    const byAction: Partial<Record<AuditAction, number>> = {};
    const byStatus: Record<string, number> = { success: 0, failure: 0, pending: 0 };
    const userIds = new Set<string>();
    let suspiciousEvents = 0;

    for (const entry of entries) {
      byCategory[entry.category]++;
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;
      byStatus[entry.status]++;
      if (entry.userId) userIds.add(entry.userId);
      if (entry.action === 'suspicious_activity') suspiciousEvents++;
    }

    return {
      totalEvents: entries.length, byCategory,
      byAction: byAction as Record<AuditAction, number>,
      byStatus, uniqueUsers: userIds.size, suspiciousEvents,
      dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
    };
  }

  async logAuth(action: 'login' | 'logout' | 'login_failed', context: {
    userId?: string; userEmail?: string; request?: NextRequest; status: 'success' | 'failure'; statusMessage?: string;
  }): Promise<AuditLogEntry> {
    return this.log({
      action, category: 'authentication', userId: context.userId, userEmail: context.userEmail,
      ipAddress: context.request ? this.getClientIP(context.request) : undefined,
      userAgent: context.request?.headers.get('user-agent') || undefined,
      status: context.status, statusMessage: context.statusMessage,
    });
  }

  async logAccess(action: AuditAction, resource: string, resourceId: string, context: {
    userId?: string; userEmail?: string; request?: NextRequest;
  }): Promise<AuditLogEntry> {
    return this.log({
      action, category: 'data_access', resource, resourceId,
      userId: context.userId, userEmail: context.userEmail,
      ipAddress: context.request ? this.getClientIP(context.request) : undefined,
      userAgent: context.request?.headers.get('user-agent') || undefined, status: 'success',
    });
  }

  async logModification(action: AuditAction, resource: string, resourceId: string, context: {
    userId?: string; userEmail?: string; request?: NextRequest;
    requestBody?: Record<string, unknown>; status?: 'success' | 'failure'; statusMessage?: string;
  }): Promise<AuditLogEntry> {
    return this.log({
      action, category: 'data_modification', resource, resourceId,
      userId: context.userId, userEmail: context.userEmail,
      ipAddress: context.request ? this.getClientIP(context.request) : undefined,
      userAgent: context.request?.headers.get('user-agent') || undefined,
      requestMethod: context.request?.method, requestPath: context.request?.nextUrl.pathname,
      requestBody: context.requestBody, status: context.status || 'success', statusMessage: context.statusMessage,
    });
  }

  async logSecurity(action: AuditAction, context: {
    userId?: string; request?: NextRequest; responseCode?: number; metadata?: Record<string, unknown>;
  }): Promise<AuditLogEntry> {
    return this.log({
      action, category: 'security', userId: context.userId,
      ipAddress: context.request ? this.getClientIP(context.request) : undefined,
      userAgent: context.request?.headers.get('user-agent') || undefined,
      responseCode: context.responseCode,
      status: action === 'suspicious_activity' ? 'failure' : 'success',
      metadata: context.metadata,
    });
  }

  async logBilling(action: AuditAction, context: {
    userId: string; resourceId?: string; status?: 'success' | 'failure'; metadata?: Record<string, unknown>;
  }): Promise<AuditLogEntry> {
    return this.log({
      action, category: 'billing', userId: context.userId, resource: 'subscription',
      resourceId: context.resourceId, status: context.status || 'success', metadata: context.metadata,
    });
  }

  private getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIP = request.headers.get('x-real-ip');
    if (realIP) return realIP;
    return 'unknown';
  }

  private sanitizeData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!data) return undefined;
    const sensitiveFields = ['password', 'currentPassword', 'newPassword', 'apiKey', 'secret', 'token', 'accessToken', 'refreshToken', 'creditCard', 'ssn', 'secretKey'];
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (sensitiveFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeData(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private parseEntry(analytics: { id: string; userId: string; event: string; payload?: string | null | undefined; createdAt: Date }): AuditLogEntry {
    let data: Partial<AuditLogEntry> = {};
    if (analytics.payload) { try { data = JSON.parse(analytics.payload); } catch { /* use defaults */ } }
    const action = (analytics.event.replace('audit:', '') as AuditAction) || 'system';
    return {
      id: analytics.id, timestamp: analytics.createdAt.toISOString(),
      userId: analytics.userId === 'system' ? undefined : analytics.userId,
      action, category: data.category || ACTION_TO_CATEGORY[action] || 'system',
      status: data.status || 'success', ...data,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const auditLogService = new AuditLogService();

export async function logAuditEvent(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
  return auditLogService.log(entry);
}

export async function logAuthEvent(action: 'login' | 'logout' | 'login_failed', context: {
  userId?: string; userEmail?: string; request?: NextRequest; status: 'success' | 'failure'; statusMessage?: string;
}): Promise<AuditLogEntry> {
  return auditLogService.logAuth(action, context);
}

export async function logAccessEvent(action: AuditAction, resource: string, resourceId: string, context: {
  userId?: string; userEmail?: string; request?: NextRequest;
}): Promise<AuditLogEntry> {
  return auditLogService.logAccess(action, resource, resourceId, context);
}
