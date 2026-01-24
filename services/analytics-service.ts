import prisma from "@/lib/prisma";

export interface AnalyticsEvent {
  event: string;
  payload?: Record<string, any>;
  userId: string;
}

export interface UsageData {
  provider: string;
  requests: number;
  tokens: number;
  errors: number;
  avgResponseTime: number;
  date?: string;
}

export async function recordAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
  try {
    await prisma.analytics.create({
      data: {
        event: event.event,
        payload: JSON.stringify(event.payload || {}),
        userId: event.userId,
      },
    });
  } catch (error) {
    console.error("Error recording analytics event:", error);
    throw error;
  }
}

export async function getAnalytics(userId?: string): Promise<UsageData[]> {
  try {
    const analytics = await prisma.analytics.findMany({
      where: userId ? { userId } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Process analytics data into usage format
    const usageMap = new Map<string, UsageData>();

    analytics.forEach((event) => {
      const payload = event.payload ? JSON.parse(event.payload as string) : {};
      const provider = payload?.provider || 'unknown';
      const existing = usageMap.get(provider) || {
        provider,
        requests: 0,
        tokens: 0,
        errors: 0,
        avgResponseTime: 0,
      };

      switch (event.event) {
        case 'llm_request':
          existing.requests++;
          existing.tokens += payload?.tokens || 0;
          existing.avgResponseTime = (existing.avgResponseTime + (payload?.responseTime || 0)) / existing.requests;
          break;
        case 'llm_error':
          existing.errors++;
          break;
      }

      usageMap.set(provider, existing);
    });

    return Array.from(usageMap.values());
  } catch (error) {
    console.error("Error getting analytics:", error);
    return [];
  }
}

export async function getDailyUsage(userId?: string, days: number = 7): Promise<UsageData[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analytics = await prisma.analytics.findMany({
      where: {
        ...(userId ? { userId } : {}),
        createdAt: {
          gte: startDate,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date and provider
    const dailyMap = new Map<string, Map<string, UsageData>>();

    analytics.forEach((event) => {
      const date = event.createdAt.toISOString().split('T')[0];
      const payload = event.payload ? JSON.parse(event.payload as string) : {};
      const provider = payload?.provider || 'unknown';
      
      if (!dailyMap.has(date)) {
        dailyMap.set(date, new Map());
      }
      
      const dayMap = dailyMap.get(date)!;
      const existing = dayMap.get(provider) || {
        provider,
        requests: 0,
        tokens: 0,
        errors: 0,
        avgResponseTime: 0,
        date,
      };

      switch (event.event) {
        case 'llm_request':
          existing.requests++;
          existing.tokens += payload?.tokens || 0;
          existing.avgResponseTime = (existing.avgResponseTime + (payload?.responseTime || 0)) / existing.requests;
          break;
        case 'llm_error':
          existing.errors++;
          break;
      }

      dayMap.set(provider, existing);
    });

    // Flatten the data
    const result: UsageData[] = [];
    dailyMap.forEach((dayMap) => {
      dayMap.forEach((usage) => {
        result.push(usage);
      });
    });

    return result;
  } catch (error) {
    console.error("Error getting daily usage:", error);
    return [];
  }
}