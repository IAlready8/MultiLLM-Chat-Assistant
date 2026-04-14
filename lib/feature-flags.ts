/**
 * Feature Flag System
 *
 * Provides controlled feature rollout capabilities including percentage
 * rollouts, user targeting rules, environment overrides, and A/B testing support.
 *
 * @module lib/feature-flags
 */

import { getServerTimestamp } from '@/lib/utils';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export type FlagType = 'boolean' | 'string' | 'number' | 'json';

export type RolloutStrategy =
  | 'enabled'
  | 'disabled'
  | 'percentage'
  | 'user_id'
  | 'user_list'
  | 'env_override'
  | 'date_range';

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  type: FlagType;
  defaultValue: unknown;
  strategy: RolloutStrategy;
  config: FlagConfig;
  environments: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FlagConfig {
  percentage?: number;
  userIds?: string[];
  envVar?: string;
  startDate?: string;
  endDate?: string;
  rules?: TargetingRule[];
}

export interface TargetingRule {
  attribute: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'regex';
  value: string | string[] | number;
}

export interface FlagEvaluation {
  value: unknown;
  found: boolean;
  reason: string;
  variation?: string;
}

export interface FlagContext {
  userId?: string;
  userEmail?: string;
  userTier?: string;
  environment?: string;
  attributes?: Record<string, unknown>;
}

// ============================================================================
// Default Flags
// ============================================================================

const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    id: 'ff_new_chat_ui',
    name: 'New Chat UI',
    description: 'Enable the redesigned chat interface',
    type: 'boolean',
    defaultValue: false,
    strategy: 'percentage',
    config: { percentage: 20 },
    environments: [],
    active: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'ff_advanced_analytics',
    name: 'Advanced Analytics',
    description: 'Show advanced usage analytics dashboard',
    type: 'boolean',
    defaultValue: false,
    strategy: 'user_list',
    config: { userIds: [] },
    environments: [],
    active: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'ff_max_conversations',
    name: 'Maximum Conversations',
    description: 'Maximum number of conversations per user',
    type: 'number',
    defaultValue: 100,
    strategy: 'env_override',
    config: { envVar: 'FEATURE_MAX_CONVERSATIONS' },
    environments: [],
    active: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'ff_custom_branding',
    name: 'Custom Branding',
    description: 'Allow custom branding configuration',
    type: 'boolean',
    defaultValue: false,
    strategy: 'user_id',
    config: { percentage: 50 },
    environments: [],
    active: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'ff_beta_features',
    name: 'Beta Features',
    description: 'Enable access to beta features',
    type: 'boolean',
    defaultValue: false,
    strategy: 'user_list',
    config: { rules: [{ attribute: 'userTier', operator: 'in', value: ['pro', 'enterprise'] }] },
    environments: [],
    active: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

// ============================================================================
// Flag Store
// ============================================================================

class FlagStore {
  private flags: Map<string, FeatureFlag> = new Map();

  constructor() {
    for (const flag of DEFAULT_FLAGS) {
      this.flags.set(flag.id, flag);
    }
  }

  get(id: string): FeatureFlag | undefined { return this.flags.get(id); }
  getAll(): FeatureFlag[] { return Array.from(this.flags.values()); }
  set(flag: FeatureFlag): void { this.flags.set(flag.id, flag); }
  delete(id: string): void { this.flags.delete(id); }
  clear(): void { this.flags.clear(); }
}

// ============================================================================
// Feature Flag Service
// ============================================================================

export class FeatureFlagService {
  private store: FlagStore;
  private evaluationCache: Map<string, { value: unknown; expiresAt: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor() {
    this.store = new FlagStore();
  }

  evaluate(flagId: string, context: FlagContext = {}): FlagEvaluation {
    const cacheKey = `${flagId}:${context.userId || 'anonymous'}`;
    const cached = this.getCachedEvaluation(cacheKey);
    if (cached) return cached;

    const flag = this.store.get(flagId);
    if (!flag) {
      return { value: undefined, found: false, reason: `Flag '${flagId}' not found` };
    }

    if (!flag.active) {
      const eval_result: FlagEvaluation = {
        value: flag.defaultValue, found: true,
        reason: 'Flag is inactive, returning default value',
      };
      this.cacheEvaluation(cacheKey, eval_result);
      return eval_result;
    }

    const value = this.evaluateStrategy(flag, context);
    const eval_result: FlagEvaluation = {
      value, found: true, reason: `Evaluated using strategy: ${flag.strategy}`,
    };
    this.cacheEvaluation(cacheKey, eval_result);
    return eval_result;
  }

  private evaluateStrategy(flag: FeatureFlag, context: FlagContext): unknown {
    switch (flag.strategy) {
      case 'enabled': return true;
      case 'disabled': return false;
      case 'percentage': return this.evaluatePercentage(flag, context);
      case 'user_id': return this.evaluateUserId(flag, context);
      case 'user_list': return this.evaluateUserList(flag, context);
      case 'env_override': return this.evaluateEnvOverride(flag);
      case 'date_range': return this.evaluateDateRange(flag);
      default: return flag.defaultValue;
    }
  }

  private evaluatePercentage(flag: FeatureFlag, context: FlagContext): unknown {
    const percentage = flag.config.percentage || 0;
    if (percentage >= 100) return true;
    if (percentage <= 0) return false;
    const hashInput = context.userId || crypto.randomBytes(16).toString('hex');
    return this.hashToBucket(hashInput, flag.id) < percentage;
  }

  private evaluateUserId(flag: FeatureFlag, context: FlagContext): unknown {
    if (!context.userId) return flag.defaultValue;
    return this.hashToBucket(context.userId, flag.id) < (flag.config.percentage || 50);
  }

  private evaluateUserList(flag: FeatureFlag, context: FlagContext): unknown {
    if (!context.userId) return flag.defaultValue;
    return (flag.config.userIds || []).includes(context.userId);
  }

  private evaluateEnvOverride(flag: FeatureFlag): unknown {
    const envVar = flag.config.envVar;
    if (!envVar) return flag.defaultValue;
    const envValue = process.env[envVar];
    if (envValue === undefined) return flag.defaultValue;
    switch (flag.type) {
      case 'boolean': return envValue === 'true' || envValue === '1';
      case 'number': return Number(envValue) || flag.defaultValue;
      default: return envValue;
    }
  }

  private evaluateDateRange(flag: FeatureFlag): unknown {
    const now = new Date();
    if (flag.config.startDate && now < new Date(flag.config.startDate)) return false;
    if (flag.config.endDate && now > new Date(flag.config.endDate)) return false;
    return true;
  }

  private hashToBucket(input: string, salt: string): number {
    const hash = crypto.createHash('sha256').update(`${salt}:${input}`).digest('hex');
    return parseInt(hash.substring(0, 8), 16) % 100;
  }

  private getCachedEvaluation(cacheKey: string): FlagEvaluation | null {
    const cached = this.evaluationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value as FlagEvaluation;
    if (cached) this.evaluationCache.delete(cacheKey);
    return null;
  }

  private cacheEvaluation(cacheKey: string, evaluation: FlagEvaluation): void {
    this.evaluationCache.set(cacheKey, { value: evaluation, expiresAt: Date.now() + this.CACHE_TTL });
    if (this.evaluationCache.size > 1000) {
      for (const [key, val] of this.evaluationCache) {
        if (val.expiresAt < Date.now()) this.evaluationCache.delete(key);
      }
    }
  }

  createFlag(flag: Omit<FeatureFlag, 'id' | 'createdAt' | 'updatedAt'>): FeatureFlag {
    const newFlag: FeatureFlag = {
      ...flag,
      id: `ff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    };
    this.store.set(newFlag);
    this.evaluationCache.clear();
    return newFlag;
  }

  updateFlag(id: string, updates: Partial<FeatureFlag>): FeatureFlag | null {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: FeatureFlag = { ...existing, ...updates, id: existing.id, updatedAt: getServerTimestamp() };
    this.store.set(updated);
    this.evaluationCache.clear();
    return updated;
  }

  deleteFlag(id: string): boolean {
    if (!this.store.get(id)) return false;
    this.store.delete(id);
    this.evaluationCache.clear();
    return true;
  }

  getAllFlags(): FeatureFlag[] { return this.store.getAll(); }

  getFlagsForEnvironment(environment: string): FeatureFlag[] {
    return this.store.getAll().filter(
      flag => flag.environments.length === 0 || flag.environments.includes(environment)
    );
  }
}

// ============================================================================
// Convenience Exports
// ============================================================================

export const featureFlagService = new FeatureFlagService();

export function isFeatureEnabled(flagId: string, context?: FlagContext): boolean {
  return Boolean(featureFlagService.evaluate(flagId, context).value);
}

export function getFeatureValue<T>(flagId: string, defaultValue: T, context?: FlagContext): T {
  const evaluation = featureFlagService.evaluate(flagId, context);
  if (evaluation.value === undefined || evaluation.value === null) return defaultValue;
  return evaluation.value as T;
}

export function evaluateFlag(flagId: string, context?: FlagContext): FlagEvaluation {
  return featureFlagService.evaluate(flagId, context);
}
