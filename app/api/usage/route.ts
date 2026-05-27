import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/usage
 *
 * Returns aggregated token usage and cost data for the authenticated user.
 * Supports optional query params:
 *   ?days=30       Number of days to look back (default: 30)
 *   ?provider=openai  Filter by provider
 *
 * Response shape:
 * {
 *   summary: { totalPromptTokens, totalCompletionTokens, totalTokens, totalCostUsd, messageCount },
 *   byProvider: [ { provider, promptTokens, completionTokens, totalTokens, costUsd, messageCount } ],
 *   byDay: [ { date, promptTokens, completionTokens, costUsd, messageCount } ],
 *   byModel: [ { model, promptTokens, completionTokens, costUsd, messageCount } ]
 * }
 */
export async function GET(req: Request) {
    const authCheck = await getAuthenticatedUser();
    if (authCheck instanceof NextResponse) return authCheck;
    const { user } = authCheck;

    const url = new URL(req.url);
    const daysParam = url.searchParams.get('days');
    const providerFilter = url.searchParams.get('provider');
    const days = Math.min(Math.max(parseInt(daysParam || '30', 10) || 30, 1), 365);

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    try {
        // Base where clause
        const whereClause: any = {
            conversation: { userId: user.id },
            role: 'assistant',
            createdAt: { gte: sinceDate },
            promptTokens: { not: null },
        };

        if (providerFilter) {
            whereClause.provider = providerFilter;
        }

        // Fetch all assistant messages with token data
        const messages = await prisma.message.findMany({
            where: whereClause,
            select: {
                provider: true,
                model: true,
                promptTokens: true,
                completionTokens: true,
                totalTokens: true,
                costUsd: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        // Aggregate summary
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        let totalTokens = 0;
        let totalCostUsd = 0;

        const byProviderMap = new Map<string, {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
            costUsd: number;
            messageCount: number;
        }>();

        const byModelMap = new Map<string, {
            promptTokens: number;
            completionTokens: number;
            costUsd: number;
            messageCount: number;
        }>();

        const byDayMap = new Map<string, {
            promptTokens: number;
            completionTokens: number;
            costUsd: number;
            messageCount: number;
        }>();

        for (const msg of messages) {
            const pt = msg.promptTokens || 0;
            const ct = msg.completionTokens || 0;
            const tt = msg.totalTokens || (pt + ct);
            const cost = msg.costUsd || 0;

            totalPromptTokens += pt;
            totalCompletionTokens += ct;
            totalTokens += tt;
            totalCostUsd += cost;

            // By provider
            const providerKey = msg.provider || 'unknown';
            const pEntry = byProviderMap.get(providerKey) || {
                promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, messageCount: 0,
            };
            pEntry.promptTokens += pt;
            pEntry.completionTokens += ct;
            pEntry.totalTokens += tt;
            pEntry.costUsd += cost;
            pEntry.messageCount += 1;
            byProviderMap.set(providerKey, pEntry);

            // By model
            const modelKey = msg.model || 'unknown';
            const mEntry = byModelMap.get(modelKey) || {
                promptTokens: 0, completionTokens: 0, costUsd: 0, messageCount: 0,
            };
            mEntry.promptTokens += pt;
            mEntry.completionTokens += ct;
            mEntry.costUsd += cost;
            mEntry.messageCount += 1;
            byModelMap.set(modelKey, mEntry);

            // By day
            const dayKey = msg.createdAt.toISOString().split('T')[0];
            const dEntry = byDayMap.get(dayKey) || {
                promptTokens: 0, completionTokens: 0, costUsd: 0, messageCount: 0,
            };
            dEntry.promptTokens += pt;
            dEntry.completionTokens += ct;
            dEntry.costUsd += cost;
            dEntry.messageCount += 1;
            byDayMap.set(dayKey, dEntry);
        }

        // Convert maps to arrays
        const byProvider = Array.from(byProviderMap.entries()).map(([provider, data]) => ({
            provider,
            ...data,
        })).sort((a, b) => b.totalTokens - a.totalTokens);

        const byModel = Array.from(byModelMap.entries()).map(([model, data]) => ({
            model,
            ...data,
        })).sort((a, b) => b.messageCount - a.messageCount);

        const byDay = Array.from(byDayMap.entries()).map(([date, data]) => ({
            date,
            ...data,
        })).sort((a, b) => a.date.localeCompare(b.date));

        return NextResponse.json({
            period: { days, since: sinceDate.toISOString() },
            summary: {
                totalPromptTokens,
                totalCompletionTokens,
                totalTokens,
                totalCostUsd: Math.round(totalCostUsd * 100000) / 100000,
                messageCount: messages.length,
            },
            byProvider,
            byModel,
            byDay,
        });
    } catch (error) {
        console.error('Usage API error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch usage data' },
            { status: 500 }
        );
    }
}
