import { expect, test, type BrowserContext } from '@playwright/test'
import { encode } from 'next-auth/jwt'

const addAuthenticatedSession = async (context: BrowserContext) => {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is required for authenticated E2E tests')
  }

  const sessionToken = await encode({
    secret,
    token: {
      sub: 'pipeline-e2e-user',
      email: 'pipeline-e2e@example.test',
      name: 'Pipeline E2E User',
    },
  })
  const port = process.env.PORT || '3000'
  await context.addCookies([
    {
      name: 'next-auth.session-token',
      value: sessionToken,
      url: `http://localhost:${port}`,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
}

test.describe('Pipeline flow', () => {
  test('runs orchestration with configured providers and renders result metrics', async ({
    page,
    context,
  }) => {
    await addAuthenticatedSession(context)
    const state: {
      lastBody: null | {
        prompt: string
        requests: Array<{ provider: string; model: string; prompt: string }>
      }
    } = {
      lastBody: null,
    }

    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    await page.route('**/api/config', async route => {
      await new Promise(resolve => setTimeout(resolve, 300))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configuredProviders: ['openai', 'anthropic', 'deepseek'],
        }),
      })
    })

    await page.route('**/api/llm/orchestrate', async route => {
      state.lastBody = route.request().postDataJSON() as {
        prompt: string
        requests: Array<{ provider: string; model: string; prompt: string }>
      }

      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-orchestration-fallback': 'local',
        },
        body: JSON.stringify([
          {
            provider: 'openai',
            model: 'gpt-4',
            content: 'OpenAI plan with three execution phases.',
            prompt_tokens: 150,
            completion_tokens: 220,
            cost_usd: 0.0123,
            latency_ms: 300,
          },
          {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
            content: 'Anthropic plan emphasizing risks and mitigations.',
            prompt_tokens: 140,
            completion_tokens: 240,
            cost_usd: 0.0091,
            latency_ms: 260,
          },
          {
            provider: 'deepseek',
            model: 'deepseek-v4-flash',
            content: 'DeepSeek plan billed directly by the provider.',
            prompt_tokens: 100,
            completion_tokens: 100,
            cost_usd: null,
            cost_label: 'Provider-billed',
            latency_ms: 240,
          },
        ]),
      })
    })

    await page.goto('/pipeline', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    await expect(page.getByText('Loading configured providers...')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'LLM Orchestration Pipeline' })
    ).toBeVisible()
    await expect(page.getByText('Loading configured providers...')).toBeHidden()
    await expect(page.getByLabel('DeepSeek')).toBeChecked()

    await page
      .getByPlaceholder('Enter your prompt here...')
      .fill('Draft a launch and risk plan for Q2 release.')
    await page.getByRole('button', { name: 'Run Orchestration' }).click()

    await expect(page.getByText('Fallback: local')).toBeVisible()
    await expect(
      page.getByText('OpenAI plan with three execution phases.')
    ).toBeVisible()
    await expect(
      page.getByText('Anthropic plan emphasizing risks and mitigations.')
    ).toBeVisible()
    await expect(
      page.getByText('DeepSeek plan billed directly by the provider.')
    ).toBeVisible()
    await expect(page.getByText(/Cost: Provider-billed/)).toBeVisible()
    await expect(page.getByText(/\+ provider-billed/)).toBeVisible()
    await expect(
      page.getByText('Total estimated tokens processed: 950')
    ).toBeVisible()
    await expect
      .poll(() => state.lastBody?.requests.length ?? 0)
      .toBe(3)

    await page.getByRole('button', { name: 'Clear Results' }).click()
    await expect(
      page.getByText('OpenAI plan with three execution phases.')
    ).toHaveCount(0)
  })

  test('handles local validation and orchestration API failure', async ({
    page,
    context,
  }) => {
    await addAuthenticatedSession(context)
    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    await page.route('**/api/config', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configuredProviders: [],
        }),
      })
    })

    await page.route('**/api/llm/orchestrate', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Provider key missing for selected model.' }),
      })
    })

    await page.goto('/pipeline', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    await expect(page.getByText('No providers are configured yet.')).toBeVisible()

    await page.getByRole('button', { name: 'Run Orchestration' }).click()
    await expect(
      page.getByText('Enter a prompt before running orchestration.')
    ).toBeVisible()

    await page.getByRole('button', { name: 'Use Sample Prompt' }).click()
    await page.getByLabel('OpenAI').uncheck()
    await page.getByRole('button', { name: 'Run Orchestration' }).click()
    await expect(
      page.getByText('Enable at least one provider before running orchestration.')
    ).toBeVisible()

    await page.getByLabel('OpenAI').check()
    await page.getByRole('button', { name: 'Run Orchestration' }).click()
    await expect(
      page
        .locator('main')
        .getByText(/Provider key missing for selected model\./)
        .first()
    ).toBeVisible()
  })
})
