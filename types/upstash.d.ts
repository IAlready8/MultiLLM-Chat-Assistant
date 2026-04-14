declare module '@upstash/ratelimit' {
  export class Ratelimit {
    constructor(config: { redis: unknown; limiter: unknown; analytics?: boolean })
    static slidingWindow: unknown
    limit(key: string, opts: { window: number; limit: number }): Promise<{ success: boolean; remaining: number; reset: number }>
  }
}

declare module '@upstash/redis' {
  export class Redis {
    constructor(config: { url: string; token: string })
    ping(): Promise<string>
  }
}

export {}
