import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import {
  buildAttributionMeta,
  mergeAttributionFromCookieHeader,
  readAttributionFromCookieHeader,
} from '@/lib/acquisition-attribution'
import { createGuestUserRecord, getDemoAccountContext } from '@/lib/demo-account'
import {
  getParsedAnalyticsEvents,
  getWorkflowMetrics,
  ParsedAnalyticsEvent,
  recordAnalyticsEvent,
} from '@/services/analytics-service'
import { withApiMetrics } from '@/lib/api-metrics-wrapper'

type Timeframe = '24h' | '7d' | '30d'

type ProviderUsage = {
  provider: string
  requests: number
  tokens: number
  errors: number
  avgResponseTime: number
}

type UsageTrend = {
  date: string
  requests: number
  tokens: number
}

type ModelComparison = {
  provider: string
  factualAccuracy: number
  creativity: number
  helpfulness: number
  coherence: number
  conciseness: number
}

type AnalyticsSource = 'analytics' | 'comparison'
type AttributionMeta = {
  source: string | null
  campaign: string | null
  cohort: string | null
}

type ActivationStep = {
  key: 'configuredProviders' | 'personas' | 'comparisonReadyConversations' | 'weeklySavedBriefComparisons'
  label: string
  current: number
  target: number
  complete: boolean
}

type Step11OutboundMetrics = {
  attributedEvents: number
  uniqueCohorts: number
  analyticsViews: number
  comparisonViews: number
  comparisonReadyConversations: number
}

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  googleai: 'Google AI',
  openrouter: 'OpenRouter',
  grok: 'Grok',
  kimi: 'Kimi',
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const parseNumeric = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const providerLabel = (provider: string): string => {
  const key = provider.toLowerCase().trim()
  if (!key) {
    return 'Unknown'
  }
  return PROVIDER_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

const estimateTokens = (payload: Record<string, unknown>): number => {
  const direct =
    parseNumeric(payload.tokens) ||
    parseNumeric(payload.total_tokens) ||
    parseNumeric(payload.totalTokens)

  if (direct > 0) {
    return Math.round(direct)
  }

  const prompt =
    parseNumeric(payload.prompt_tokens) || parseNumeric(payload.promptTokens)
  const completion =
    parseNumeric(payload.completion_tokens) ||
    parseNumeric(payload.completionTokens)

  if (prompt > 0 || completion > 0) {
    return Math.round(prompt + completion)
  }

  const content = typeof payload.content === 'string' ? payload.content : ''
  return content ? Math.max(1, Math.round(content.length / 4)) : 0
}

const readResponseTime = (payload: Record<string, unknown>): number =>
  parseNumeric(payload.responseTime) ||
  parseNumeric(payload.response_time) ||
  parseNumeric(payload.responseTimeMs) ||
  parseNumeric(payload.latency)

const getTimeframe = (request: Request): Timeframe => {
  const url = new URL(request.url)
  const value = url.searchParams.get('timeframe')
  if (value === '24h' || value === '7d' || value === '30d') {
    return value
  }
  return '7d'
}

const getSource = (request: Request): AnalyticsSource => {
  const url = new URL(request.url)
  return url.searchParams.get('source') === 'comparison'
    ? 'comparison'
    : 'analytics'
}

const buildProviderUsage = (events: ParsedAnalyticsEvent[]): ProviderUsage[] => {
  const usage = new Map<
    string,
    ProviderUsage & { responseSamples: number; responseSum: number }
  >()

  for (const event of events) {
    if (event.event !== 'llm_request' && event.event !== 'llm_error') {
      continue
    }

    const provider = String(event.payload.provider || 'unknown').toLowerCase()
    const existing = usage.get(provider) || {
      provider: providerLabel(provider),
      requests: 0,
      tokens: 0,
      errors: 0,
      avgResponseTime: 0,
      responseSamples: 0,
      responseSum: 0,
    }

    if (event.event === 'llm_request') {
      existing.requests += 1
      existing.tokens += estimateTokens(event.payload)
      const responseTime = readResponseTime(event.payload)
      if (responseTime > 0) {
        existing.responseSum += responseTime
        existing.responseSamples += 1
      }
    } else if (event.event === 'llm_error') {
      existing.errors += 1
    }

    usage.set(provider, existing)
  }

  return Array.from(usage.values())
    .map(({ responseSamples, responseSum, ...item }) => ({
      ...item,
      avgResponseTime:
        responseSamples > 0 ? Math.round(responseSum / responseSamples) : 0,
    }))
    .sort((a, b) => b.requests - a.requests)
}

const buildDailyTrends = (
  events: ParsedAnalyticsEvent[],
  days: number
): UsageTrend[] => {
  const buckets = new Map<string, UsageTrend>()
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  for (let i = days - 1; i >= 0; i -= 1) {
    const point = new Date(now)
    point.setDate(now.getDate() - i)
    const key = point.toISOString().split('T')[0]
    const label = point.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
    buckets.set(key, { date: label, requests: 0, tokens: 0 })
  }

  for (const event of events) {
    const key = event.createdAt.toISOString().split('T')[0]
    const bucket = buckets.get(key)
    if (!bucket) {
      continue
    }
    if (event.event === 'llm_request') {
      bucket.requests += 1
      bucket.tokens += estimateTokens(event.payload)
    }
  }

  return Array.from(buckets.values())
}

const buildHourlyTrends = (events: ParsedAnalyticsEvent[]): UsageTrend[] => {
  const buckets = new Map<string, UsageTrend>()
  const now = new Date()
  now.setMinutes(0, 0, 0)

  for (let i = 23; i >= 0; i -= 1) {
    const point = new Date(now)
    point.setHours(now.getHours() - i)
    const key = point.toISOString().slice(0, 13)
    const label = point.toLocaleTimeString('en-US', {
      hour: 'numeric',
      hour12: true,
    })
    buckets.set(key, { date: label, requests: 0, tokens: 0 })
  }

  for (const event of events) {
    const key = event.createdAt.toISOString().slice(0, 13)
    const bucket = buckets.get(key)
    if (!bucket) {
      continue
    }
    if (event.event === 'llm_request') {
      bucket.requests += 1
      bucket.tokens += estimateTokens(event.payload)
    }
  }

  return Array.from(buckets.values())
}

const buildModelComparison = (
  events: ParsedAnalyticsEvent[],
  providerUsage: ProviderUsage[]
): ModelComparison[] => {
  const modelMap = new Map<
    string,
    { provider: string; requests: number; errors: number; tokens: number; avgResponseTime: number; responseSamples: number }
  >()

  for (const event of events) {
    if (event.event !== 'llm_request' && event.event !== 'llm_error') {
      continue
    }

    const provider = String(event.payload.provider || 'unknown').toLowerCase()
    const modelRaw = String(event.payload.model || provider || 'unknown').trim()
    const modelName = modelRaw || 'unknown'
    const existing = modelMap.get(modelName) || {
      provider: modelName,
      requests: 0,
      errors: 0,
      tokens: 0,
      avgResponseTime: 0,
      responseSamples: 0,
    }

    if (event.event === 'llm_request') {
      existing.requests += 1
      existing.tokens += estimateTokens(event.payload)
      const responseTime = readResponseTime(event.payload)
      if (responseTime > 0) {
        existing.avgResponseTime += responseTime
        existing.responseSamples += 1
      }
    } else if (event.event === 'llm_error') {
      existing.errors += 1
    }

    modelMap.set(modelName, existing)
  }

  const source =
    modelMap.size > 0
      ? Array.from(modelMap.values()).map((entry) => ({
          provider: entry.provider,
          requests: entry.requests,
          errors: entry.errors,
          tokens: entry.tokens,
          avgResponseTime:
            entry.responseSamples > 0
              ? Math.round(entry.avgResponseTime / entry.responseSamples)
              : 0,
        }))
      : providerUsage.map((entry) => ({
          provider: entry.provider,
          requests: entry.requests,
          errors: entry.errors,
          tokens: entry.tokens,
          avgResponseTime: entry.avgResponseTime,
        }))

  return source
    .filter((entry) => entry.requests > 0)
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 8)
    .map((entry) => {
      const requests = Math.max(entry.requests, 1)
      const successRate = clamp((entry.requests - entry.errors) / requests, 0, 1)
      const tokensPerRequest = entry.tokens / requests
      const latencyScore = clamp(5 - entry.avgResponseTime / 700, 1, 5)

      const factualAccuracy = clamp(2.4 + successRate * 2.6, 1, 5)
      const helpfulness = clamp(2.2 + successRate * 2.8, 1, 5)
      const coherence = clamp((factualAccuracy + helpfulness) / 2 + 0.2, 1, 5)
      const creativity = clamp(
        2.5 + Math.min(tokensPerRequest / 800, 1.5),
        1,
        5
      )
      const conciseness = clamp(
        5 - Math.min(tokensPerRequest / 1200, 2.6),
        1,
        5
      )

      return {
        provider: entry.provider,
        factualAccuracy: Number(factualAccuracy.toFixed(1)),
        creativity: Number(creativity.toFixed(1)),
        helpfulness: Number(helpfulness.toFixed(1)),
        coherence: Number(coherence.toFixed(1)),
        conciseness: Number(
          clamp((conciseness + latencyScore) / 2, 1, 5).toFixed(1)
        ),
      }
    })
}

const buildActivationFunnel = (
  workflowMetrics: Awaited<ReturnType<typeof getWorkflowMetrics>>
): ActivationStep[] => [
  {
    key: 'configuredProviders',
    label: 'Configured providers',
    current: workflowMetrics.configuredProviders,
    target: 1,
    complete: workflowMetrics.configuredProviders >= 1,
  },
  {
    key: 'personas',
    label: 'Saved personas',
    current: workflowMetrics.personas,
    target: 1,
    complete: workflowMetrics.personas >= 1,
  },
  {
    key: 'comparisonReadyConversations',
    label: 'Comparison-ready conversations',
    current: workflowMetrics.comparisonReadyConversations,
    target: 1,
    complete: workflowMetrics.comparisonReadyConversations >= 1,
  },
  {
    key: 'weeklySavedBriefComparisons',
    label: 'Weekly saved brief comparisons',
    current: workflowMetrics.weeklySavedBriefComparisons,
    target: 1,
    complete: workflowMetrics.weeklySavedBriefComparisons >= 1,
  },
]

const buildEmptyWorkflowMetrics = () => ({
  configuredProviders: 0,
  personas: 0,
  comparisonReadyConversations: 0,
  weeklySavedBriefComparisons: 0,
  conversationsCreated: 0,
  comparisonViews: 0,
  analyticsViews: 0,
  billingViews: 0,
  checkoutSessionsCreated: 0,
  portalSessionsCreated: 0,
})

const buildStep11OutboundMetrics = (
  events: ParsedAnalyticsEvent[]
): Step11OutboundMetrics => {
  const founderOutbound = events.filter(
    (event) => event.payload.acquisitionSource === 'founder-outbound'
  )
  const uniqueCohorts = new Set(
    founderOutbound
      .map((event) =>
        typeof event.payload.acquisitionCohort === 'string'
          ? event.payload.acquisitionCohort
          : null
      )
      .filter((cohort): cohort is string => Boolean(cohort))
  )

  const countEvent = (eventName: string) =>
    founderOutbound.filter((event) => event.event === eventName).length

  return {
    attributedEvents: founderOutbound.length,
    uniqueCohorts: uniqueCohorts.size,
    analyticsViews: countEvent('analytics_viewed'),
    comparisonViews: countEvent('comparison_viewed'),
    comparisonReadyConversations: countEvent(
      'comparison_ready_conversation_saved'
    ),
  }
}

export const GET = withApiMetrics(async (request: Request) => {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) {
    return authCheck
  }

  const { user } = authCheck
  const timeframe = getTimeframe(request)
  const source = getSource(request)
  const days = TIMEFRAME_DAYS[timeframe]
  const attribution = readAttributionFromCookieHeader(
    request.headers.get('cookie')
  )
  const attributionMeta: AttributionMeta = buildAttributionMeta(attribution)
  const demoAccount = getDemoAccountContext()
  const guestUser = createGuestUserRecord()
  const isSharedGuestOrDemoUser =
    user.id === guestUser.id ||
    user.id === demoAccount.id ||
    user.email === guestUser.email ||
    user.email === demoAccount.email

  if (isSharedGuestOrDemoUser) {
    const emptyWorkflowMetrics = buildEmptyWorkflowMetrics()

    return NextResponse.json({
      timeframe,
      providerData: [],
      usageTrends: timeframe === '24h' ? buildHourlyTrends([]) : buildDailyTrends([], days),
      modelComparisonData: [],
      workflowMetrics: emptyWorkflowMetrics,
      activationFunnel: buildActivationFunnel(emptyWorkflowMetrics),
      step11OutboundMetrics: buildStep11OutboundMetrics([]),
      totalStats: {
        totalRequests: 0,
        totalTokens: 0,
        totalErrors: 0,
        avgResponseTime: 0,
      },
      meta: {
        source: 'empty',
        eventCount: 0,
        attribution: attributionMeta,
      },
    })
  }

  try {
    const events = await getParsedAnalyticsEvents(user.id, days)
    const workflowMetrics = await getWorkflowMetrics(user.id, days, events)
    const providerData = buildProviderUsage(events)
    const usageTrends =
      timeframe === '24h' ? buildHourlyTrends(events) : buildDailyTrends(events, days)
    const modelComparisonData = buildModelComparison(events, providerData)

    const totalStats = providerData.reduce(
      (acc, provider) => {
        acc.totalRequests += provider.requests
        acc.totalTokens += provider.tokens
        acc.totalErrors += provider.errors
        acc.avgResponseTime += provider.avgResponseTime
        return acc
      },
      {
        totalRequests: 0,
        totalTokens: 0,
        totalErrors: 0,
        avgResponseTime: 0,
      }
    )

    totalStats.avgResponseTime =
      providerData.length > 0
        ? Math.round(totalStats.avgResponseTime / providerData.length)
        : 0

    let workflowMetricsWithCurrentView = workflowMetrics

    try {
      await recordAnalyticsEvent({
        event: source === 'comparison' ? 'comparison_viewed' : 'analytics_viewed',
        userId: user.id,
        payload: mergeAttributionFromCookieHeader(
          { source, timeframe },
          request.headers.get('cookie')
        ),
      })
      workflowMetricsWithCurrentView = {
        ...workflowMetrics,
        comparisonViews:
          source === 'comparison'
            ? workflowMetrics.comparisonViews + 1
            : workflowMetrics.comparisonViews,
        analyticsViews:
          source === 'analytics'
            ? workflowMetrics.analyticsViews + 1
            : workflowMetrics.analyticsViews,
      }
    } catch (error) {
      console.warn('Failed to record analytics view event:', error)
    }

    return NextResponse.json({
      timeframe,
      providerData,
      usageTrends,
      modelComparisonData,
      workflowMetrics: workflowMetricsWithCurrentView,
      activationFunnel: buildActivationFunnel(workflowMetricsWithCurrentView),
      step11OutboundMetrics: buildStep11OutboundMetrics(events),
      totalStats,
      meta: {
        source: events.length > 0 ? 'live' : 'empty',
        eventCount: events.length,
        attribution: attributionMeta,
      },
    })
  } catch (error) {
    console.error('Failed to build analytics dashboard:', error)
    return NextResponse.json(
      { error: 'Failed to load analytics dashboard' },
      { status: 500 }
    )
  }
})
