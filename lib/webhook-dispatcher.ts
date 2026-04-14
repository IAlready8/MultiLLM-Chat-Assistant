/**
 * Webhook Event Dispatcher
 *
 * Provides an internal pub/sub system for application events that enables
 * third-party integrations and automation workflows. Supports webhook
 * registration, event filtering, HMAC signing, retry logic with exponential
 * backoff, and delivery status tracking.
 *
 * @module lib/webhook-dispatcher
 */

// ============================================================================
// Types
// ============================================================================

export type WebhookEventType =
  | 'conversation.created' | 'conversation.updated' | 'conversation.deleted'
  | 'message.sent' | 'message.received'
  | 'persona.created' | 'persona.updated' | 'persona.deleted'
  | 'goal.created' | 'goal.updated' | 'goal.completed'
  | 'user.signup' | 'user.login'
  | 'billing.subscription.created' | 'billing.subscription.updated' | 'billing.subscription.cancelled'
  | 'api_key.created' | 'api_key.revoked';

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  userId: string;
  data: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface WebhookSubscription {
  id: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  active: boolean;
  headers?: Record<string, string>;
  filters?: WebhookFilter[];
  createdAt: string;
  lastDeliveryAt?: string;
  successCount: number;
  failureCount: number;
}

export interface WebhookFilter {
  field: string;
  operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'in' | 'not';
  value: string | string[];
}

export interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  event: WebhookEvent;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  timestamp: string;
  attempt: number;
  success: boolean;
  durationMs?: number;
}

// ============================================================================
// Event Templates
// ============================================================================

export const EVENT_TEMPLATES = {
  conversationCreated: (userId: string, conversationId: string, title: string): WebhookEvent => ({
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'conversation.created',
    timestamp: new Date().toISOString(),
    userId,
    data: { conversationId, title },
    idempotencyKey: `conv_created_${conversationId}`,
  }),
  messageSent: (userId: string, conversationId: string, messageId: string, provider: string, model: string): WebhookEvent => ({
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'message.sent',
    timestamp: new Date().toISOString(),
    userId,
    data: { conversationId, messageId, provider, model },
    idempotencyKey: `msg_sent_${messageId}`,
  }),
  messageReceived: (userId: string, conversationId: string, messageId: string, provider: string, model: string): WebhookEvent => ({
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'message.received',
    timestamp: new Date().toISOString(),
    userId,
    data: { conversationId, messageId, provider, model },
    idempotencyKey: `msg_received_${messageId}`,
  }),
  personaCreated: (userId: string, personaId: string, title: string): WebhookEvent => ({
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'persona.created',
    timestamp: new Date().toISOString(),
    userId,
    data: { personaId, title },
    idempotencyKey: `persona_created_${personaId}`,
  }),
  goalCompleted: (userId: string, goalId: string, title: string): WebhookEvent => ({
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'goal.completed',
    timestamp: new Date().toISOString(),
    userId,
    data: { goalId, title },
    idempotencyKey: `goal_completed_${goalId}`,
  }),
  userSignup: (userId: string, email: string): WebhookEvent => ({
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'user.signup',
    timestamp: new Date().toISOString(),
    userId,
    data: { email },
    idempotencyKey: `user_signup_${userId}`,
  }),
  billingSubscriptionCreated: (userId: string, subscriptionId: string, tier: string): WebhookEvent => ({
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'billing.subscription.created',
    timestamp: new Date().toISOString(),
    userId,
    data: { subscriptionId, tier },
    idempotencyKey: `sub_created_${subscriptionId}`,
  }),
} as const;

// ============================================================================
// HMAC Signing
// ============================================================================

async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `sha256=${Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

// ============================================================================
// Webhook Store
// ============================================================================

class WebhookStore {
  private subscriptions: Map<string, WebhookSubscription> = new Map();
  private deliveries: Map<string, WebhookDelivery[]> = new Map();

  async createSubscription(subscription: WebhookSubscription): Promise<void> {
    this.subscriptions.set(subscription.id, subscription);
  }

  async getSubscription(id: string): Promise<WebhookSubscription | null> {
    return this.subscriptions.get(id) || null;
  }

  async getSubscriptionsByEvent(eventType: WebhookEventType): Promise<WebhookSubscription[]> {
    const active: WebhookSubscription[] = [];
    for (const sub of this.subscriptions.values()) {
      if (!sub.active) continue;
      if (sub.events.length === 0 || sub.events.includes(eventType)) {
        active.push(sub);
      }
    }
    return active;
  }

  async updateSubscription(id: string, updates: Partial<WebhookSubscription>): Promise<void> {
    const sub = this.subscriptions.get(id);
    if (sub) this.subscriptions.set(id, { ...sub, ...updates });
  }

  async deleteSubscription(id: string): Promise<void> {
    this.subscriptions.delete(id);
    this.deliveries.delete(id);
  }

  async recordDelivery(delivery: WebhookDelivery): Promise<void> {
    const existing = this.deliveries.get(delivery.subscriptionId) || [];
    existing.push(delivery);
    this.deliveries.set(delivery.subscriptionId, existing);
  }

  async getDeliveries(subscriptionId: string, limit = 100): Promise<WebhookDelivery[]> {
    const deliveries = this.deliveries.get(subscriptionId) || [];
    return deliveries.slice(-limit);
  }
}

// ============================================================================
// Webhook Dispatcher
// ============================================================================

export class WebhookDispatcher {
  private store: WebhookStore;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;

  constructor(options?: { maxRetries?: number; baseRetryDelayMs?: number; maxRetryDelayMs?: number }) {
    this.store = new WebhookStore();
    this.maxRetries = options?.maxRetries ?? 3;
    this.baseRetryDelayMs = options?.baseRetryDelayMs ?? 1000;
    this.maxRetryDelayMs = options?.maxRetryDelayMs ?? 60000;
  }

  async createSubscription(url: string, secret: string, events: WebhookEventType[] = []): Promise<WebhookSubscription> {
    const subscription: WebhookSubscription = {
      id: `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      url, secret, events, active: true,
      createdAt: new Date().toISOString(),
      successCount: 0, failureCount: 0,
    };
    await this.store.createSubscription(subscription);
    return subscription;
  }

  async dispatch(event: WebhookEvent): Promise<WebhookDelivery[]> {
    const subscriptions = await this.store.getSubscriptionsByEvent(event.type);
    const deliveries: WebhookDelivery[] = [];
    for (const sub of subscriptions) {
      if (sub.filters && !this.matchesFilters(event, sub.filters)) continue;
      deliveries.push(await this.dispatchWithRetry(sub, event));
    }
    return deliveries;
  }

  private async dispatchWithRetry(subscription: WebhookSubscription, event: WebhookEvent): Promise<WebhookDelivery> {
    let attempt = 0;
    let lastError: string | undefined;
    let lastStatusCode: number | undefined;

    while (attempt <= this.maxRetries) {
      const result = await this.deliverEvent(subscription, event, attempt);
      if (result.success) {
        await this.store.updateSubscription(subscription.id, {
          lastDeliveryAt: new Date().toISOString(),
          successCount: subscription.successCount + 1,
        });
        return result.delivery;
      }
      lastError = result.error;
      lastStatusCode = result.statusCode;
      attempt++;
      if (attempt <= this.maxRetries) {
        const delay = Math.min(this.baseRetryDelayMs * Math.pow(2, attempt - 1), this.maxRetryDelayMs);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    await this.store.updateSubscription(subscription.id, { failureCount: subscription.failureCount + 1 });
    return {
      id: `dlv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      subscriptionId: subscription.id, event,
      statusCode: lastStatusCode, error: lastError,
      timestamp: new Date().toISOString(), attempt: this.maxRetries + 1, success: false,
    };
  }

  private async deliverEvent(subscription: WebhookSubscription, event: WebhookEvent, attempt: number) {
    const startTime = Date.now();
    const payload = JSON.stringify(event);

    try {
      const signature = await generateSignature(payload, subscription.secret);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': event.type,
        'X-Webhook-Delivery': `dlv_${Date.now()}`,
        'User-Agent': 'MultiLLM-Webhook/1.0',
        ...subscription.headers,
      };

      const response = await fetch(subscription.url, {
        method: 'POST', headers, body: payload,
        signal: AbortSignal.timeout(30000),
      });

      const durationMs = Date.now() - startTime;
      const success = response.ok || response.status === 200 || response.status === 201;

      const delivery: WebhookDelivery = {
        id: `dlv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        subscriptionId: subscription.id, event,
        statusCode: response.status,
        timestamp: new Date().toISOString(),
        attempt: attempt + 1, success, durationMs,
      };
      await this.store.recordDelivery(delivery);

      if (!success) {
        const responseBody = await response.text().catch(() => '');
        return { success: false, error: `HTTP ${response.status}: ${responseBody.slice(0, 500)}`, statusCode: response.status, delivery };
      }
      return { success: true, statusCode: response.status, delivery };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const delivery: WebhookDelivery = {
        id: `dlv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        subscriptionId: subscription.id, event,
        error: errorMessage, timestamp: new Date().toISOString(),
        attempt: attempt + 1, success: false, durationMs,
      };
      await this.store.recordDelivery(delivery);
      return { success: false, error: errorMessage, delivery };
    }
  }

  private matchesFilters(event: WebhookEvent, filters: WebhookFilter[]): boolean {
    for (const filter of filters) {
      const value = this.getNestedValue(event as unknown as Record<string, unknown>, filter.field);
      if (value === undefined) continue;
      switch (filter.operator) {
        case 'equals': if (value !== filter.value) return false; break;
        case 'contains': if (!String(value).includes(String(filter.value))) return false; break;
        case 'starts_with': if (!String(value).startsWith(String(filter.value))) return false; break;
        case 'ends_with': if (!String(value).endsWith(String(filter.value))) return false; break;
        case 'in': if (!Array.isArray(filter.value) || !filter.value.includes(String(value))) return false; break;
        case 'not': if (value === filter.value) return false; break;
      }
    }
    return true;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key: string) => {
      if (current && typeof current === 'object') return (current as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  }

  async getSubscription(id: string): Promise<WebhookSubscription | null> {
    return this.store.getSubscription(id);
  }

  async deleteSubscription(id: string): Promise<void> {
    await this.store.deleteSubscription(id);
  }

  async getDeliveryHistory(subscriptionId: string, limit?: number): Promise<WebhookDelivery[]> {
    return this.store.getDeliveries(subscriptionId, limit);
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const webhookDispatcher = new WebhookDispatcher();

export async function dispatchWebhookEvent(event: WebhookEvent): Promise<WebhookDelivery[]> {
  return webhookDispatcher.dispatch(event);
}

export async function createWebhookSubscription(
  url: string, secret: string, events?: WebhookEventType[]
): Promise<WebhookSubscription> {
  return webhookDispatcher.createSubscription(url, secret, events);
}
