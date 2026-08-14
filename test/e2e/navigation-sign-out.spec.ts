import { expect, test } from '@playwright/test'
import { encode } from 'next-auth/jwt'

const installLocalSession = async (page: import('@playwright/test').Page) => {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('Sign-out browser tests require a local auth secret.')
  }

  const token = await encode({
    secret,
    token: {
      sub: 'pilot-user',
      id: 'pilot-user',
      name: 'Pilot User',
      email: 'pilot@example.com',
      role: 'MEMBER',
      tier: 'FREE',
    },
  })

  await page.context().addCookies([
    {
      name: 'next-auth.session-token',
      value: token,
      url: `http://localhost:${process.env.PORT || 3000}`,
    },
  ])
}

test.describe('Authenticated navigation sign out', () => {
  test('signs out from the desktop navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await installLocalSession(page)
    await page.goto('/auth/register')

    await page.getByRole('button', { name: 'Sign out' }).click()

    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 15_000 })
    await expect(
      page.getByRole('heading', { name: 'Sign in' }),
    ).toBeVisible()
  })

  test('signs out from the mobile navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await installLocalSession(page)
    await page.goto('/auth/register')

    await page.getByRole('button', { name: 'Toggle menu' }).click()
    const menu = page.getByRole('dialog', { name: 'Menu' })
    await expect(menu.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await menu.getByRole('button', { name: 'Sign out' }).click()

    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 15_000 })
    await expect(
      page.getByRole('heading', { name: 'Sign in' }),
    ).toBeVisible()
  })
})
