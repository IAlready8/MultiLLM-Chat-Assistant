/**
 * Conversation Export Service
 *
 * Provides comprehensive conversation export capabilities including multiple
 * formats (JSON, Markdown, CSV, HTML), customizable templates, and batch
 * export functionality.
 *
 * @module services/export-service
 */

import { prisma } from '@/lib/prisma';
import { getServerTimestamp } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'json' | 'markdown' | 'csv' | 'html';

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata?: boolean;
  includeSystemPrompts?: boolean;
  template?: ExportTemplate;
  compress?: boolean;
}

export interface ExportTemplate {
  header?: string;
  message?: string;
  footer?: string;
  dateFormat?: string;
}

export interface ConversationExport {
  conversationId: string;
  title: string;
  exportedAt: string;
  format: ExportFormat;
  content: string;
  metadata: ExportMetadata;
}

export interface BatchExport {
  exportId: string;
  userId: string;
  exportedAt: string;
  conversations: ConversationExport[];
  totalExports: number;
  totalMessages: number;
  format: ExportFormat;
}

export interface ExportMetadata {
  exportedAt: string;
  conversationId: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  firstProvider?: string;
  lastProvider?: string;
  userId: string;
}

type ConversationWithMessages = any;

// ============================================================================
// Default Templates
// ============================================================================

const DEFAULT_TEMPLATES: Record<ExportFormat, ExportTemplate> = {
  json: { dateFormat: 'ISO 8601' },
  markdown: {
    dateFormat: 'YYYY-MM-DD HH:mm:ss',
    header: '# {title}\n\n*Exported: {date}*\n\n---\n\n',
    message: '**{role}** ({date}):\n\n{content}\n\n---\n\n',
    footer: '\n\n---\n*Exported from MultiLLM Chat Assistant*',
  },
  csv: { dateFormat: 'YYYY-MM-DD HH:mm:ss' },
  html: {
    dateFormat: 'YYYY-MM-DD HH:mm:ss',
    header: '<!DOCTYPE html>\n<html>\n<head>\n  <title>{title}</title>\n  <style>\n    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }\n    .message { margin-bottom: 20px; padding: 15px; border-radius: 8px; }\n    .user { background: #e3f2fd; }\n    .assistant { background: #f5f5f5; }\n    .system { background: #fff3e0; font-style: italic; }\n    .meta { color: #666; font-size: 0.85em; }\n  </style>\n</head>\n<body>\n  <h1>{title}</h1>\n  <p class="meta">Exported: {date}</p>\n',
    message: '  <div class="message {role}">\n    <strong>{role_upper}</strong>\n    <span class="meta">({date})</span>\n    <p>{content}</p>\n  </div>\n',
    footer: '</body>\n</html>',
  },
};

// ============================================================================
// Export Service
// ============================================================================

export class ConversationExportService {
  async exportConversation(conversationId: string, userId: string, options: ExportOptions): Promise<ConversationExport> {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    }) as any;
    if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

    const content = this.formatConversation(conversation, options);
    const metadata = this.buildMetadata(conversation);

    return { conversationId, title: conversation.title, exportedAt: getServerTimestamp(), format: options.format, content, metadata };
  }

  async exportBatch(userId: string, conversationIds?: string[], options: ExportOptions = { format: 'json' }): Promise<BatchExport> {
    const exportId = `export_${Date.now()}_${userId}`;
    const whereClause: any = { userId };
    if (conversationIds && conversationIds.length > 0) whereClause.id = { in: conversationIds };

    const conversations = await prisma.conversation.findMany({
      where: whereClause,
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    }) as any;

    const exports: ConversationExport[] = [];
    let totalMessages = 0;

    for (const conv of conversations) {
      const content = this.formatConversation(conv, options);
      const metadata = this.buildMetadata(conv);
      totalMessages += conv.messages.length;
      exports.push({ conversationId: conv.id, title: conv.title, exportedAt: getServerTimestamp(), format: options.format, content, metadata });
    }

    return { exportId, userId, exportedAt: getServerTimestamp(), conversations: exports, totalExports: exports.length, totalMessages, format: options.format };
  }

  private formatConversation(conversation: ConversationWithMessages, options: ExportOptions): string {
    const template = options.template || DEFAULT_TEMPLATES[options.format];
    switch (options.format) {
      case 'json': return this.formatAsJSON(conversation, options);
      case 'markdown': return this.formatAsMarkdown(conversation, options, template);
      case 'csv': return this.formatAsCSV(conversation, options);
      case 'html': return this.formatAsHTML(conversation, options, template);
      default: return this.formatAsJSON(conversation, options);
    }
  }

  private formatAsJSON(conversation: ConversationWithMessages, options: ExportOptions): string {
    return JSON.stringify({
      id: conversation.id, title: conversation.title,
      createdAt: conversation.createdAt, updatedAt: conversation.updatedAt,
      messages: conversation.messages.map((msg: { role: string; content: string; provider?: string | null; model?: string | null; createdAt?: Date }) => ({
        role: msg.role, content: msg.content,
        provider: options.includeMetadata ? msg.provider : undefined,
        model: options.includeMetadata ? msg.model : undefined,
        createdAt: options.includeMetadata ? msg.createdAt : undefined,
      })),
    }, null, 2);
  }

  private formatAsMarkdown(conversation: ConversationWithMessages, options: ExportOptions, template: ExportTemplate): string {
    const lines: string[] = [];
    lines.push(this.applyTemplate(template.header || DEFAULT_TEMPLATES.markdown.header || '', {
      title: conversation.title, date: this.formatDate(conversation.createdAt, template.dateFormat),
    }));
    for (const message of conversation.messages) {
      if (message.role === 'system' && !options.includeSystemPrompts) continue;
      lines.push(this.applyTemplate(template.message || '**{role}** ({date}):\n\n{content}\n\n---\n\n', {
        role: this.formatRole(message.role), role_upper: this.formatRole(message.role).toUpperCase(),
        content: message.content, date: this.formatDate(message.createdAt, template.dateFormat),
      }));
    }
    lines.push(template.footer || DEFAULT_TEMPLATES.markdown.footer || '');
    return lines.join('');
  }

  private formatAsCSV(conversation: ConversationWithMessages, options: ExportOptions): string {
    const lines: string[] = [];
    lines.push(['Index', 'Role', 'Content', 'Provider', 'Model', 'Created At'].map(h => `"${h}"`).join(','));
    let index = 1;
    for (const message of conversation.messages) {
      if (message.role === 'system' && !options.includeSystemPrompts) continue;
      lines.push([
        index.toString(), this.formatRole(message.role),
        `"${message.content.replace(/"/g, '""')}"`,
        options.includeMetadata ? (message.provider || '') : '',
        options.includeMetadata ? (message.model || '') : '',
        options.includeMetadata ? this.formatDate(message.createdAt, 'ISO 8601') : '',
      ].join(','));
      index++;
    }
    return lines.join('\n');
  }

  private formatAsHTML(conversation: ConversationWithMessages, options: ExportOptions, template: ExportTemplate): string {
    const lines: string[] = [];
    lines.push(this.applyTemplate(template.header || DEFAULT_TEMPLATES.html.header || '', {
      title: this.escapeHtml(conversation.title), date: this.formatDate(conversation.createdAt, template.dateFormat),
    }));
    for (const message of conversation.messages) {
      if (message.role === 'system' && !options.includeSystemPrompts) continue;
      lines.push(this.applyTemplate(template.message || '  <div class="message {role}">\n    <strong>{role_upper}</strong>\n    <span class="meta">({date})</span>\n    <p>{content}</p>\n  </div>\n', {
        role: this.formatRole(message.role), role_upper: this.formatRole(message.role).toUpperCase(),
        content: this.escapeHtml(message.content), date: this.formatDate(message.createdAt, template.dateFormat),
      }));
    }
    lines.push(template.footer || DEFAULT_TEMPLATES.html.footer || '');
    return lines.join('');
  }

  private buildMetadata(conversation: ConversationWithMessages): ExportMetadata {
    const messages = conversation.messages.filter((m: { role: string }) => m.role !== 'system');
    const firstUserMessage = messages.find((m: { role: string }) => m.role === 'user');
    const lastAssistantMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'assistant');
    return {
      exportedAt: getServerTimestamp(), conversationId: conversation.id, messageCount: messages.length,
      createdAt: conversation.createdAt.toISOString(), updatedAt: conversation.updatedAt.toISOString(),
      firstProvider: firstUserMessage?.provider ?? undefined,
      lastProvider: lastAssistantMessage?.provider ?? undefined,
      userId: conversation.userId,
    };
  }

  private applyTemplate(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  private formatRole(role: string): string {
    return ({ user: 'User', assistant: 'Assistant', system: 'System' } as Record<string, string>)[role] || role;
  }

  private formatDate(date: Date, format?: string): string {
    if (format === 'ISO 8601' || !format) return date.toISOString();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return format.replace('YYYY', year.toString()).replace('MM', month).replace('DD', day)
      .replace('HH', hours).replace('mm', minutes).replace('ss', seconds);
  }

  private escapeHtml(text: string): string {
    const escapeMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, char => escapeMap[char] || char);
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const conversationExportService = new ConversationExportService();

export async function exportConversation(conversationId: string, userId: string, options: ExportOptions): Promise<ConversationExport> {
  return conversationExportService.exportConversation(conversationId, userId, options);
}

export async function exportConversationsBatch(userId: string, conversationIds?: string[], options?: ExportOptions): Promise<BatchExport> {
  return conversationExportService.exportBatch(userId, conversationIds, { format: 'json', includeMetadata: true, ...options });
}
