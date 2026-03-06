import { expect, test } from '@playwright/test'

test.describe('Home and API Test utility flows', () => {
  test('renders home shell and navigates to settings', async ({ page }) => {
    await page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    await expect(
      page.getByRole('heading', { name: 'MultiLLM Chat Assistant' })
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to Multi-Chat' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View Analytics' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to Settings' })).toBeVisible()

    await page.getByRole('link', { name: 'Go to Settings' }).click()
    await expect(page).toHaveURL(/\/settings$/)
  })

  test('renders /api-test utility page', async ({ page }) => {
    await page.goto('/api-test', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    await expect(
      page.getByRole('heading', { name: 'API Configuration Test' })
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Run a connectivity check' })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Test API Connection' })
    ).toBeVisible()
    await expect(page.getByText('Provider Status')).toBeVisible()
  })
})
