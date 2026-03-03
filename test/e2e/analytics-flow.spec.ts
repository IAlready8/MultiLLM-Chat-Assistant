import { expect, test } from '@playwright/test'

type Timeframe = '24h' | '7d' | '30d'

const buildZeroTrends = (timeframe: Timeframe) => {
  const length = timeframe === '24h' ? 24 : timeframe === '30d' ? 30 : 7
  return Array.from({ length }, (_, index) => ({
    date: `Slot ${index + 1}`,
    requests: 0,
    tokens: 0,
  }))
}

const buildLivePayload = (timeframe: Timeframe) => {
  const isDaily = timeframe !== '24h'
  const requests = isDaily ? 12 : 5
  const modelName = isDaily ? 'gpt-4o-mini' : 'gpt-4.1-mini'

  return {
    timeframe,
    providerData: [
      {
        provider: 'OpenAI',
        requests,
        tokens: requests * 210,
        errors: 1,
        avgResponseTime: isDaily ? 240 : 190,
      },
    ],
    modelComparisonData: [
      {
        provider: modelName,
        factualAccuracy: 4.6,
        creativity: 4.1,
        helpfulness: 4.7,
        coherence: 4.5,
        conciseness: 4.2,
      },
    ],
    usageTrends: [
      {
        date: isDaily ? 'Mar 1' : '8 AM',
        requests: Math.max(requests - 2, 1),
        tokens: Math.max((requests - 2) * 180, 40),
      },
      {
        date: isDaily ? 'Mar 2' : '9 AM',
        requests,
        tokens: requests * 210,
      },
    ],
    totalStats: {
      totalRequests: requests,
      totalTokens: requests * 210,
      totalErrors: 1,
      avgResponseTime: isDaily ? 240 : 190,
    },
    meta: {
      source: 'live' as const,
      eventCount: requests + 1,
    },
  }
}

const buildEmptyPayload = (timeframe: Timeframe) => ({
  timeframe,
  providerData: [],
  modelComparisonData: [],
  usageTrends: buildZeroTrends(timeframe),
  totalStats: {
    totalRequests: 0,
    totalTokens: 0,
    totalErrors: 0,
    avgResponseTime: 0,
  },
  meta: {
    source: 'empty' as const,
    eventCount: 0,
  },
})

test.describe('Analytics flow', () => {
  test('covers loading, empty telemetry, refresh to live data, and timeframe switch', async ({
    page,
  }) => {
    const state = {
      requestCount: 0,
      seenTimeframes: [] as Timeframe[],
    }

    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    await page.route('**/api/analytics**', async route => {
      const url = new URL(route.request().url())
      const timeframe = (url.searchParams.get('timeframe') ?? '7d') as Timeframe
      state.seenTimeframes.push(timeframe)

      if (state.requestCount === 0) {
        state.requestCount += 1
        await new Promise(resolve => setTimeout(resolve, 350))
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildEmptyPayload(timeframe)),
        })
        return
      }

      state.requestCount += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildLivePayload(timeframe)),
      })
    })

    await page.goto('/analytics', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    await expect(page.getByText('Loading analytics...')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No Telemetry Yet' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()

    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(
      page.getByRole('heading', { name: 'Analytics Dashboard' })
    ).toBeVisible()
    await expect(page.getByText('Live data')).toBeVisible()
    await expect(page.getByText('gpt-4o-mini')).toBeVisible()

    await page.getByRole('button', { name: '24H' }).click()
    await expect(page.getByText('gpt-4.1-mini')).toBeVisible()
    await expect
      .poll(() => state.seenTimeframes.filter(value => value === '24h').length)
      .toBeGreaterThanOrEqual(1)
  })

  test('shows hard failure state and allows retry recovery', async ({ page }) => {
    const state = {
      failCount: 0,
    }

    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    await page.route('**/api/analytics**', async route => {
      if (state.failCount < 2) {
        state.failCount += 1
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Failed to load analytics dashboard' }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildLivePayload('7d')),
      })
    })

    await page.goto('/analytics', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    await expect(
      page.getByRole('heading', { name: 'Unable to Load Analytics' })
    ).toBeVisible()
    await expect(page.getByText('Failed to load analytics (500)')).toBeVisible()

    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(
      page.getByRole('heading', { name: 'Analytics Dashboard' })
    ).toBeVisible()
    await expect(page.getByText('Live data')).toBeVisible()
  })
})
