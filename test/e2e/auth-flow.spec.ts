import { expect, test } from '@playwright/test'

test.describe('Authentication flow', () => {
  test('redirects an unauthenticated workspace request to sign in', async ({
    page,
  }) => {
    await page.goto('/settings?tab=providers')

    await expect(page).toHaveURL(/\/auth\/signin/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
  })

  test('labels password authentication as existing-account sign in', async ({
    page,
  }) => {
    await page.goto('/auth/signin')

    await expect(page.getByText('Existing password account')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Sign in with password' }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Create an account' }),
    ).toBeVisible()
  })

  test('validates credential fields without attempting account creation', async ({
    page,
  }) => {
    await page.goto('/auth/signin')
    await page.getByLabel('Email').fill('invalid-email')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign in with password' }).click()

    await expect(page.getByText('Enter a valid email address.')).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/signin/)
  })

  test('opens the OAuth-first account creation surface', async ({ page }) => {
    await page.goto('/auth/signin?callbackUrl=%2Fsettings')
    const createAccountLink = page.getByRole('link', {
      name: 'Create an account',
    })
    await expect(createAccountLink).toBeVisible()
    await createAccountLink.click()

    await expect(page).toHaveURL(/\/auth\/register/, { timeout: 15_000 })
    await expect(
      page.getByRole('heading', { name: 'Create account' }),
    ).toBeVisible()
    await expect(
      page.getByText(/use Google to create a durable workspace account/i),
    ).toBeVisible()
    await expect(
      page.getByText(
        /operator must add a Google or GitHub OAuth application before new accounts can be created/i,
      ),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByText(/password registration is unavailable/i),
    ).toBeVisible()
  })

  test('does not expose demo or guest access on auth pages', async ({ page }) => {
    await page.goto('/auth/signin')

    await expect(page.getByText(/demo account/i)).toHaveCount(0)
    await expect(page.getByText(/continue as guest/i)).toHaveCount(0)
  })
})
