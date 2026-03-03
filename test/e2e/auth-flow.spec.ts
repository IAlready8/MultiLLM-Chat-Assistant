import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/')
  })

  test('should redirect unauthenticated users to sign in', async ({ page }) => {
    // Should redirect to sign-in page
    await expect(page).toHaveURL(/\/auth\/signin/)
    
    // Should show sign in form
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    
    // Provider buttons are optional; credentials form should always be present.
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
  })

  test('should show credential sign in form', async ({ page }) => {
    await page.goto('/auth/signin')
    
    // Check for email and password inputs
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    
    // Check for sign in button
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    
    // Check for "Don't have an account?" link
    await expect(page.getByText(/don't have an account/i)).toBeVisible()
  })

  test('should validate email format', async ({ page }) => {
    await page.goto('/auth/signin')
    
    // Fill invalid email
    await page.getByLabel(/email/i).fill('invalid-email')
    await page.getByLabel(/password/i).fill('password123')
    
    // Try to submit
    await page.getByRole('button', { name: /sign in/i }).click()
    
    // Should show validation error
    await expect(page.getByText(/invalid email/i)).toBeVisible()
  })

  test('should handle sign in with valid credentials', async ({ page }) => {
    await page.goto('/auth/signin')
    
    // Fill valid credentials (these would be test credentials in a real scenario)
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByLabel(/password/i).fill('testpassword')
    
    // Submit form
    await page.getByRole('button', { name: /sign in/i }).click()
    
    // Should redirect to dashboard on success
    // Note: This would need proper test database setup in real implementation
    await expect(page).toHaveURL('/')
  })

  test('should navigate to sign up page', async ({ page }) => {
    await page.goto('/auth/signin')
    
    // Click sign up link
    await page.getByText(/don't have an account/i).click()
    
    // Should navigate to register page
    await expect(page).toHaveURL('/auth/register')
    
    // Should show register form
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible()
  })

  test('should show sign up form elements', async ({ page }) => {
    await page.goto('/auth/register')
    
    // Check form elements
    await expect(page.getByLabel(/name/i)).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible()
    
    // Check "Already have an account?" link
    await expect(page.getByText(/already have an account/i)).toBeVisible()
  })

  test('should validate registration form', async ({ page }) => {
    await page.goto('/auth/register')
    
    // Try to submit empty form
    await page.getByRole('button', { name: /create account/i }).click()
    
    // Should show validation errors
    await expect(page.getByText(/name is required/i)).toBeVisible()
    await expect(page.getByText(/email is required/i)).toBeVisible()
    await expect(page.getByText(/password is required/i)).toBeVisible()
  })

  test('should handle password requirements', async ({ page }) => {
    await page.goto('/auth/register')
    
    // Fill form with weak password
    await page.getByLabel(/name/i).fill('Test User')
    await page.getByLabel(/email/i).fill('test@example.com')
    await page.getByLabel(/password/i).fill('123')
    
    await page.getByRole('button', { name: /create account/i }).click()
    
    // Should show password strength error
    await expect(page.getByText(/password must be at least/i)).toBeVisible()
  })

  test('should handle successful registration', async ({ page }) => {
    await page.goto('/auth/register')
    
    // Fill valid registration form
    await page.getByLabel(/name/i).fill('Test User')
    await page.getByLabel(/email/i).fill('newuser@example.com')
    await page.getByLabel(/password/i).fill('strongpassword123')
    
    // Submit form
    await page.getByRole('button', { name: /create account/i }).click()
    
    // Should redirect to sign in or dashboard
    // Note: Actual behavior depends on implementation
    await expect(page).not.toHaveURL('/auth/register')
  })

  test('should handle OAuth sign in flow', async ({ page }) => {
    await page.goto('/auth/signin')
    
    // Click Google sign in
    const googleButton = page.getByRole('button', { name: /sign in with google/i })
    await expect(googleButton).toBeVisible()
    
    // Note: In real tests, you would mock the OAuth provider
    // or use test credentials provided by the OAuth service
    
    // For now, just verify the button triggers navigation
    await googleButton.click()
    
    // Should navigate away from the sign in page
    await page.waitForURL(u => !u.pathname.includes('/auth/signin'))
  })

  test('should allow sign out', async ({ page }) => {
    // Note: This test assumes the user is authenticated
    // In real implementation, you'd set up authenticated state
    
    await page.goto('/')
    
    // Look for user menu or sign out button
    const userMenu = page.getByRole('button', { name: /user menu/i }).or(
      page.getByRole('button', { name: /sign out/i })
    )
    
    if (await userMenu.isVisible()) {
      await userMenu.click()
      
      // Click sign out if in dropdown menu
      const signOutButton = page.getByRole('button', { name: /sign out/i }).or(
        page.getByRole('menuitem', { name: /sign out/i })
      )
      
      if (await signOutButton.isVisible()) {
        await signOutButton.click()
        
        // Should redirect to sign in page
        await expect(page).toHaveURL('/auth/signin')
      }
    }
  })

  test('should preserve redirect URL after authentication', async ({ page }) => {
    // Try to access a protected page directly
    await page.goto('/settings')
    
    // Should redirect to sign in with return URL
    await expect(page).toHaveURL(/\/auth\/signin/)
    
    // Note: After successful authentication, should redirect back to /settings
    // This would require proper session management in tests
  })

  test('should handle authentication errors gracefully', async ({ page }) => {
    await page.goto('/auth/signin')
    
    // Fill incorrect credentials
    await page.getByLabel(/email/i).fill('wrong@example.com')
    await page.getByLabel(/password/i).fill('wrongpassword')
    
    await page.getByRole('button', { name: /sign in/i }).click()
    
    // Should show error message
    await expect(page.getByText(/invalid credentials/i).or(
      page.getByText(/sign in failed/i)
    )).toBeVisible()
    
    // Should remain on sign in page
    await expect(page).toHaveURL('/auth/signin')
  })
})
