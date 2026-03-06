import { expect, test } from '@playwright/test'

type AnalyticsPayload = {
  timeframe: '30d'
  providerData: Array<{
    provider: string
    requests: number
    tokens: number
    errors: number
    avgResponseTime: number
  }>
  modelComparisonData: Array<{
    provider: string
    factualAccuracy: number
    creativity: number
    helpfulness: number
    coherence: number
    conciseness: number
  }>
  meta: {
    source: 'live' | 'empty'
  }
}

const liveAnalyticsPayload = (
  source: 'live' | 'empty' = 'live'
): AnalyticsPayload => ({
  timeframe: '30d',
  providerData: [
    {
      provider: 'OpenAI',
      requests: 9,
      tokens: 2700,
      errors: 1,
      avgResponseTime: 230,
    },
    {
      provider: 'Anthropic',
      requests: 6,
      tokens: 1800,
      errors: 0,
      avgResponseTime: 280,
    },
  ],
  modelComparisonData: [
    {
      provider: 'gpt-4o-mini',
      factualAccuracy: 4.7,
      creativity: 4.3,
      helpfulness: 4.6,
      coherence: 4.5,
      conciseness: 4.2,
    },
    {
      provider: 'claude-3.5-sonnet',
      factualAccuracy: 4.8,
      creativity: 4.1,
      helpfulness: 4.7,
      coherence: 4.6,
      conciseness: 4.4,
    },
  ],
  meta: {
    source,
  },
})

test.describe('Comparison flow', () => {
  test('renders model metrics and conversation response comparison from real API payloads', async ({
    page,
  }) => {
    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    await page.route('**/api/analytics**', async route => {
      await new Promise(resolve => setTimeout(resolve, 300))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(liveAnalyticsPayload('live')),
      })
    })

    await page.route('**/api/conversations', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'conv-1',
            title: 'Release planning',
            userId: 'user-1',
            createdAt: '2026-03-01T10:00:00.000Z',
            updatedAt: '2026-03-01T10:05:00.000Z',
          },
          {
            id: 'conv-2',
            title: 'Incident summary',
            userId: 'user-1',
            createdAt: '2026-03-02T08:00:00.000Z',
            updatedAt: '2026-03-02T08:05:00.000Z',
          },
        ]),
      })
    })

    await page.route('**/api/conversations/*', async route => {
      const id = new URL(route.request().url()).pathname.split('/').pop()
      if (id === 'conv-2') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'conv-2',
            title: 'Incident summary',
            userId: 'user-1',
            createdAt: '2026-03-02T08:00:00.000Z',
            updatedAt: '2026-03-02T08:05:00.000Z',
            messages: [
              {
                id: 'msg-21',
                conversationId: 'conv-2',
                role: 'user',
                content: 'Summarize outage causes.',
                provider: null,
                model: null,
                createdAt: '2026-03-02T08:00:00.000Z',
              },
              {
                id: 'msg-22',
                conversationId: 'conv-2',
                role: 'assistant',
                content: 'Root cause: transient upstream failures with retry storm.',
                provider: 'anthropic',
                model: 'claude-3.5-sonnet',
                createdAt: '2026-03-02T08:01:00.000Z',
              },
            ],
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'conv-1',
          title: 'Release planning',
          userId: 'user-1',
          createdAt: '2026-03-01T10:00:00.000Z',
          updatedAt: '2026-03-01T10:05:00.000Z',
          messages: [
            {
              id: 'msg-11',
              conversationId: 'conv-1',
              role: 'user',
              content: 'Plan the rollout.',
              provider: null,
              model: null,
              createdAt: '2026-03-01T10:00:00.000Z',
            },
            {
              id: 'msg-12',
              conversationId: 'conv-1',
              role: 'assistant',
              content: 'Roll out in three phases with traffic ramping.',
              provider: 'openai',
              model: 'gpt-4o-mini',
              createdAt: '2026-03-01T10:01:00.000Z',
            },
            {
              id: 'msg-13',
              conversationId: 'conv-1',
              role: 'assistant',
              content: 'Add health checks and canary alerts.',
              provider: 'anthropic',
              model: 'claude-3.5-sonnet',
              createdAt: '2026-03-01T10:02:00.000Z',
            },
          ],
        }),
      })
    })

    await page.goto('/comparison', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    await expect(page.getByText('Loading model metrics...')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Model Comparison' })).toBeVisible()
    await expect(page.getByText('Live data')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'gpt-4o-mini' }).first()
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'claude-3.5-sonnet' }).first()
    ).toBeVisible()

    await page.getByRole('tab', { name: 'Response Comparison' }).click()
    await expect(
      page.getByRole('heading', { name: 'Conversation Comparison' })
    ).toBeVisible()
    await expect(page.getByText('Plan the rollout.')).toBeVisible()
    await expect(
      page.getByText('Roll out in three phases with traffic ramping.')
    ).toBeVisible()

    await page.locator('select').first().selectOption('conv-2')
    await expect(page.getByText('Summarize outage causes.')).toBeVisible()
    await expect(
      page.getByText(
        'Root cause: transient upstream failures with retry storm.'
      )
    ).toBeVisible()
  })

  test('shows comparison load failure and recovers through retry', async ({
    page,
  }) => {
    const state = { shouldFail: true }

    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    await page.route('**/api/analytics**', async route => {
      if (state.shouldFail) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'analytics failed' }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(liveAnalyticsPayload('live')),
      })
    })

    await page.route('**/api/conversations', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.goto('/comparison', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    await expect(page.getByText('Failed to load analytics (500)')).toBeVisible()
    state.shouldFail = false
    await page.getByRole('button', { name: 'Retry' }).click()

    await expect(page.getByText('Failed to load analytics (500)')).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'gpt-4o-mini' }).first()
    ).toBeVisible()
  })
})
