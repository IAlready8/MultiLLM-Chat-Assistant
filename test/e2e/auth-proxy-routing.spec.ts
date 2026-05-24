import { expect, test } from '@playwright/test'

test.describe('strict auth proxy routing', () => {
  test('redirects protected pages to sign in and keeps assets healthy', async ({
    page,
  }) => {
    const failedAssets: string[] = []

    page.on('requestfailed', request => {
      const url = request.url()

      if (url.includes('/_next/') || /\.(css|js|woff2?|png|svg)$/.test(url)) {
        failedAssets.push(`${url}: ${request.failure()?.errorText ?? 'failed'}`)
      }
    })

    await page.goto('/multi-chat')

    await expect(page).toHaveURL(
      /\/auth\/signin\?callbackUrl=%2Fmulti-chat/
    )
    await expect(
      page.getByRole('heading', { name: /sign in/i })
    ).toBeVisible()

    await page.goto('/settings')

    await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fsettings/)
    await expect(
      page.getByRole('heading', { name: /sign in/i })
    ).toBeVisible()

    expect(failedAssets).toEqual([])
  })

  test('/api/health remains public', async ({ request }) => {
    const response = await request.get('/api/health')

    expect(response.status()).toBe(200)
  })
})
