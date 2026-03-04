import { expect, test } from '@playwright/test'

test.describe('Settings provider configuration', () => {
  const openProvidersTab = async (
    page: import('@playwright/test').Page
  ) => {
    const providersTab = page.getByRole('tab', { name: 'API Providers' })
    const providersHeading = page.getByRole('heading', {
      name: 'API Provider Configuration',
    })

    await expect(providersTab).toBeVisible({ timeout: 15_000 })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await providersTab.click()
      if (await providersHeading.isVisible().catch(() => false)) {
        return
      }
      await page.waitForTimeout(150)
    }

    await expect(providersHeading).toBeVisible()
  }

  test('saves, verifies, and clears an OpenAI key from /settings', async ({
    page,
  }) => {
    const state = {
      configuredProviders: ['openai'] as string[],
      saveCalls: [] as Array<{ provider: string; apiKey: string }>,
    }

    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    await page.route('**/api/config', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            configuredProviders: state.configuredProviders,
          }),
        })
        return
      }

      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as {
          provider: string
          apiKey: string
        }
        state.saveCalls.push(body)

        const provider = body.provider?.trim().toLowerCase()
        const apiKey = body.apiKey?.trim() ?? ''
        if (provider) {
          if (apiKey) {
            state.configuredProviders = Array.from(
              new Set([...state.configuredProviders, provider])
            )
          } else {
            state.configuredProviders = state.configuredProviders.filter(
              item => item !== provider
            )
          }
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
        return
      }

      await route.fallback()
    })

    await page.route('**/api/test-api-key', async route => {
      const body = route.request().postDataJSON() as {
        provider: string
        apiKey?: string
        testSaved?: boolean
      }

      if (body.testSaved) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            valid: true,
            reason: 'ok',
            message: 'API key verified successfully.',
            latencyMs: 120,
          }),
        })
        return
      }

      const isValid = Boolean(body.apiKey?.includes('valid'))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: isValid,
          reason: isValid ? 'ok' : 'invalid',
          message: isValid
            ? 'API key verified successfully.'
            : 'Provider rejected this API key.',
          latencyMs: isValid ? 95 : 88,
        }),
      })
    })

    await page.goto('/settings', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    await openProvidersTab(page)
    await expect(page.getByLabel('OpenAI API Key')).toBeVisible()
    await expect(page.getByText('Saved').first()).toBeVisible()

    await page.getByLabel('OpenAI API Key').fill('sk-openai-valid-123456')
    await page.getByRole('button', { name: 'Save' }).first().click()

    await expect
      .poll(
        () =>
          state.saveCalls.filter(
            call =>
              call.provider === 'openai' &&
              call.apiKey === 'sk-openai-valid-123456'
          ).length
      )
      .toBe(1)
    await expect(page.getByText('Connected').first()).toBeVisible()

    await page.getByRole('button', { name: 'Clear' }).first().click()
    await expect
      .poll(
        () =>
          state.saveCalls.filter(
            call => call.provider === 'openai' && call.apiKey === ''
          ).length
      )
      .toBe(1)
    await expect(page.getByText('Connected').first()).toHaveCount(0)
  })

  test('rejects invalid key without persisting provider config', async ({
    page,
  }) => {
    const state = {
      configPostCalls: 0,
    }

    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    await page.route('**/api/config', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ configuredProviders: [] }),
        })
        return
      }

      if (route.request().method() === 'POST') {
        state.configPostCalls += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
        return
      }

      await route.fallback()
    })

    await page.route('**/api/test-api-key', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: false,
          reason: 'invalid',
          message: 'Provider rejected this API key.',
          latencyMs: 80,
        }),
      })
    })

    await page.goto('/settings', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    await openProvidersTab(page)
    await page.getByLabel('OpenAI API Key').fill('sk-openai-bad-key')
    await page.getByRole('button', { name: 'Save' }).first().click()

    await expect(page.getByText('Invalid API Key', { exact: true }).first()).toBeVisible()
    await expect.poll(() => state.configPostCalls).toBe(0)
  })
})
