/**
 * Cache Invalidation Utility
 *
 * Provides smart cache invalidation strategies with tag-based and
 * dependency-based cache invalidation. Works with Redis or in-memory
 * cache backends.
 *
 * @module lib/cache-invalidation
 */

import { cache } from '@/lib/cache';

// ============================================================================
// Types
// ============================================================================

export interface CacheTag {
  tag: string;
  keys: string[];
  createdAt: number;
  lastAccess: number;
}

export interface CacheDependency {
  source: string;
  dependents: string[];
}

export interface InvalidationOptions {
  wait?: boolean;
  soft?: boolean;
  recursive?: boolean;
}

export interface InvalidationEvent {
  type: 'tag' | 'key' | 'pattern' | 'all';
  target: string;
  timestamp?: number;
  options: InvalidationOptions;
}

// ============================================================================
// Tag Manager
// ============================================================================

class TagManager {
  private tags: Map<string, CacheTag> = new Map();
  private readonly maxTags = 10000;
  private readonly tagTTL = 3600000; // 1 hour

  addTag(tag: string, cacheKey: string): void {
    let tagData = this.tags.get(tag);
    if (!tagData) {
      if (this.tags.size >= this.maxTags) this.cleanup();
      tagData = { tag, keys: [], createdAt: Date.now(), lastAccess: Date.now() };
      this.tags.set(tag, tagData);
    }
    if (!tagData.keys.includes(cacheKey)) tagData.keys.push(cacheKey);
    tagData.lastAccess = Date.now();
  }

  getTagKeys(tag: string): string[] {
    const tagData = this.tags.get(tag);
    if (tagData) { tagData.lastAccess = Date.now(); return [...tagData.keys]; }
    return [];
  }

  async invalidateByTag(tag: string): Promise<string[]> {
    const keys = this.getTagKeys(tag);
    this.tags.delete(tag);
    return keys;
  }

  removeKey(key: string): void {
    for (const [, tagData] of this.tags) {
      const index = tagData.keys.indexOf(key);
      if (index !== -1) tagData.keys.splice(index, 1);
    }
    for (const [tag, tagData] of this.tags) {
      if (tagData.keys.length === 0) this.tags.delete(tag);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [tag, tagData] of this.tags) {
      if (now - tagData.lastAccess > this.tagTTL) this.tags.delete(tag);
    }
    if (this.tags.size >= this.maxTags) {
      const sorted = Array.from(this.tags.entries()).sort((a, b) => a[1].lastAccess - b[1].lastAccess);
      for (const [tag] of sorted.slice(0, Math.ceil(this.maxTags * 0.1))) {
        this.tags.delete(tag);
      }
    }
  }
}

// ============================================================================
// Dependency Manager
// ============================================================================

class DependencyManager {
  private dependencies: Map<string, CacheDependency> = new Map();
  private readonly maxEntries = 5000;

  register(source: string, dependent: string): void {
    let dep = this.dependencies.get(source);
    if (!dep) {
      if (this.dependencies.size >= this.maxEntries) this.cleanup();
      dep = { source, dependents: [] };
      this.dependencies.set(source, dep);
    }
    if (!dep.dependents.includes(dependent)) dep.dependents.push(dependent);

    let reverse = this.dependencies.get(dependent);
    if (!reverse) { reverse = { source: dependent, dependents: [] }; this.dependencies.set(dependent, reverse); }
    if (!reverse.dependents.includes(source)) reverse.dependents.push(source);
  }

  getDependents(key: string): string[] {
    const dep = this.dependencies.get(key);
    return dep ? [...dep.dependents] : [];
  }

  async invalidateWithDependents(key: string, invalidateFn: (key: string) => Promise<void>): Promise<void> {
    await Promise.all([key, ...this.getDependents(key)].map(k => invalidateFn(k)));
  }

  remove(key: string): void {
    this.dependencies.delete(key);
    for (const [, dep] of this.dependencies) {
      const index = dep.dependents.indexOf(key);
      if (index !== -1) dep.dependents.splice(index, 1);
    }
  }

  private cleanup(): void {
    for (const [key, dep] of this.dependencies) {
      if (dep.dependents.length === 0) this.dependencies.delete(key);
    }
  }
}

// ============================================================================
// Staleness Tracker
// ============================================================================

class StalenessTracker {
  private staleKeys: Map<string, number> = new Map();
  private readonly maxStaleKeys = 5000;

  markStale(key: string, maxAgeMs = 0): void {
    if (this.staleKeys.size >= this.maxStaleKeys) {
      const sorted = Array.from(this.staleKeys.entries()).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < Math.ceil(this.maxStaleKeys * 0.2); i++) this.staleKeys.delete(sorted[i][0]);
    }
    this.staleKeys.set(key, maxAgeMs > 0 ? Date.now() + maxAgeMs : Date.now() + 3600000);
  }

  isStale(key: string): boolean {
    const stalenessTime = this.staleKeys.get(key);
    if (!stalenessTime) return false;
    if (Date.now() >= stalenessTime) { this.staleKeys.delete(key); return true; }
    return true;
  }

  refresh(key: string): void { this.staleKeys.delete(key); }
  clear(): void { this.staleKeys.clear(); }
}

// ============================================================================
// Main Service
// ============================================================================

export class CacheInvalidationService {
  private tagManager: TagManager;
  private dependencyManager: DependencyManager;
  private stalenessTracker: StalenessTracker;
  private eventLog: InvalidationEvent[] = [];
  private readonly maxEventLog = 1000;

  constructor() {
    this.tagManager = new TagManager();
    this.dependencyManager = new DependencyManager();
    this.stalenessTracker = new StalenessTracker();
  }

  async set<T>(key: string, value: T, options?: { ttl?: number; tags?: string[] }): Promise<void> {
    if (options?.tags) {
      for (const tag of options.tags) this.tagManager.addTag(tag, key);
    }
    // Default TTL: 1 hour (3600 seconds). Cache.set requires CacheConfig with ttl.
    const ttlSeconds = options?.ttl ?? 3600;
    await cache.set(key, value, { ttl: ttlSeconds });
  }

  async get<T>(key: string, options?: { allowStale?: boolean }): Promise<T | null> {
    if (!options?.allowStale && this.stalenessTracker.isStale(key)) return null;
    return cache.get<T>(key);
  }

  async invalidateKey(key: string, options?: InvalidationOptions): Promise<void> {
    await cache.delete(key);
    if (options?.soft) this.stalenessTracker.markStale(key);
    else this.stalenessTracker.refresh(key);
    this.tagManager.removeKey(key);
    if (options?.recursive) {
      await this.dependencyManager.invalidateWithDependents(key, async (k) => {
        await cache.delete(k);
        this.tagManager.removeKey(k);
      });
    }
    this.logEvent({ type: 'key', target: key, options: options || {} });
  }

  async invalidateTag(tag: string, options?: InvalidationOptions): Promise<number> {
    const keys = await this.tagManager.invalidateByTag(tag);
    for (const key of keys) await cache.delete(key);
    this.logEvent({ type: 'tag', target: tag, options: options || {} });
    return keys.length;
  }

  async invalidatePattern(pattern: string, options?: InvalidationOptions): Promise<number> {
    // Placeholder - would need cache implementation support for pattern matching
    this.logEvent({ type: 'pattern', target: pattern, options: options || {} });
    return 0;
  }

  async invalidateAll(options?: InvalidationOptions): Promise<void> {
    if (options?.soft) this.stalenessTracker.clear();
    else await cache.clear();
    this.logEvent({ type: 'all', target: '*', options: options || {} });
  }

  registerDependency(source: string, dependent: string): void {
    this.dependencyManager.register(source, dependent);
  }

  getRecentEvents(limit = 100): InvalidationEvent[] {
    return this.eventLog.slice(-limit);
  }

  private logEvent(event: InvalidationEvent): void {
    event.timestamp = Date.now();
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxEventLog) this.eventLog.shift();
  }
}

// ============================================================================
// Convenience Factories
// ============================================================================

export const cacheInvalidationService = new CacheInvalidationService();

export function createTaggedCache(tags: string[]) {
  return {
    async set<T>(key: string, value: T, ttl?: number) {
      return cacheInvalidationService.set(key, value, { ttl, tags });
    },
    async get<T>(key: string, allowStale?: boolean) {
      return cacheInvalidationService.get<T>(key, { allowStale });
    },
    async invalidate(options?: InvalidationOptions) {
      for (const tag of tags) await cacheInvalidationService.invalidateTag(tag, options);
    },
  };
}

export function createUserScopedCache(userId: string) {
  return createTaggedCache([`user:${userId}`, 'user:*']);
}

export function createConversationCache(conversationId: string, userId: string) {
  return createTaggedCache([`conversation:${conversationId}`, `user:${userId}`, 'user:*']);
}

export function createPersonaCache(personaId: string, userId: string) {
  return createTaggedCache([`persona:${personaId}`, `user:${userId}`, 'user:*']);
}

export async function invalidateCache(key: string, options?: InvalidationOptions): Promise<void> {
  return cacheInvalidationService.invalidateKey(key, options);
}

export async function invalidateCacheByTag(tag: string, options?: InvalidationOptions): Promise<number> {
  return cacheInvalidationService.invalidateTag(tag, options);
}
