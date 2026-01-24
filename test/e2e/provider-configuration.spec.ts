import { test, expect } from '@playwright/test'

test.describe('Provider Configuration', () => {
  // Mock authentication for these tests
  test.beforeEach(async ({ page }) => {
    // In a real implementation, you would set up authenticated session
    // For now, we'll assume authentication is handled
    await page.goto('/settings')
  })

  test('should display provider configuration interface', async ({ page }) => {
    // Should show configuration manager
    await expect(page.getByText('Provider Configuration Manager')).toBeVisible()
    
    // Should show all provider tabs
    await expect(page.getByRole('tab', { name: 'OpenAI' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Anthropic' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Google AI' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'OpenRouter' })).toBeVisible()
  })

  test('should switch between provider tabs', async ({ page }) => {
    // Initially should show OpenAI configuration
    await expect(page.getByText('OpenAI Configuration')).toBeVisible()
    
    // Click Anthropic tab
    await page.getByRole('tab', { name: 'Anthropic' }).click()
    
    // Should show Anthropic configuration
    await expect(page.getByText('Anthropic Configuration')).toBeVisible()
    
    // Should show Anthropic-specific elements
    await expect(page.getByText('claude-3-opus')).toBeVisible()
    await expect(page.getByText('claude-3-sonnet')).toBeVisible()
  })

  test('should validate API key input', async ({ page }) => {
    // Should show API key field
    const apiKeyInput = page.getByLabel(/API Key/)
    await expect(apiKeyInput).toBeVisible()
    
    // Should be password type
    await expect(apiKeyInput).toHaveAttribute('type', 'password')
    
    // Should be required
    await expect(apiKeyInput).toHaveAttribute('required')
  })

  test('should handle API key configuration flow', async ({ page }) => {
    // Fill in API key
    await page.getByLabel(/API Key/).fill('sk-test-api-key-12345')
    
    // Should show rate limits configuration
    await expect(page.getByLabel(/Requests per minute/)).toBeVisible()
    await expect(page.getByLabel(/Window \(ms\)/)).toBeVisible()
    
    // Should show test & validate button
    const testButton = page.getByRole('button', { name: /Test & Validate/i })
    await expect(testButton).toBeVisible()
  })

  test('should test API connection', async ({ page }) => {
    // Fill in API key
    await page.getByLabel(/API Key/).fill('sk-test-api-key-12345')
    
    // Click test button
    await page.getByRole('button', { name: /Test & Validate/i }).click()
    
    // Should show testing state
    await expect(page.getByText(/Testing.../i)).toBeVisible()
    
    // Wait for result (success or failure)
    await expect(
      page.getByText(/Configuration is valid/i).or(
        page.getByText(/Configuration errors/i)
      )
    ).toBeVisible({ timeout: 10000 })
  })

  test('should handle successful validation', async ({ page }) => {
    // Mock successful API response
    await page.route('/api/config/validate', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            apiKey: 'sk-test-api-key-12345',
            models: ['gpt-4', 'gpt-3.5-turbo'],
            rateLimits: { requests: 60, window: 60000 },
            isActive: true,
          },
          connectionTest: {
            success: true,
            latency: 150,
          },
        }),
      })
    })
    
    // Fill and test configuration
    await page.getByLabel(/API Key/).fill('sk-test-api-key-12345')
    await page.getByRole('button', { name: /Test & Validate/i }).click()
    
    // Should show success message
    await expect(page.getByText('Configuration is valid!')).toBeVisible()
    await expect(page.getByText('Connection test: ✓ Passed (150ms)')).toBeVisible()
    
    // Should show save button
    await expect(page.getByRole('button', { name: /Save Configuration/i })).toBeVisible()
  })

  test('should handle validation errors', async ({ page }) => {
    // Mock error response
    await page.route('/api/config/validate', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          errors: [
            { path: 'apiKey', message: 'API key is invalid' },
          ],
        }),
      })
    })
    
    // Fill invalid API key
    await page.getByLabel(/API Key/).fill('invalid-key')
    await page.getByRole('button', { name: /Test & Validate/i }).click()
    
    // Should show error message
    await expect(page.getByText('Configuration errors:')).toBeVisible()
    await expect(page.getByText('• apiKey: API key is invalid')).toBeVisible()
  })

  test('should save valid configuration', async ({ page }) => {
    // Mock validation success
    await page.route('/api/config/validate', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            apiKey: 'sk-valid-key',
            models: ['gpt-4'],
            rateLimits: { requests: 60, window: 60000 },
            isActive: true,
          },
          connectionTest: { success: true, latency: 150 },
        }),
      })
    })
    
    // Mock save success
    await page.route('/api/provider-configs/openai', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })
    
    // Configure and save
    await page.getByLabel(/API Key/).fill('sk-valid-key')
    await page.getByRole('button', { name: /Test & Validate/i }).click()
    
    await expect(page.getByRole('button', { name: /Save Configuration/i })).toBeVisible()
    await page.getByRole('button', { name: /Save Configuration/i }).click()
    
    // Should show success toast or message
    await expect(
      page.getByText(/configuration saved/i).or(
        page.getByText(/OpenAI configuration saved/i)
      )
    ).toBeVisible()
    
    // Should show configured badge
    await expect(page.getByText('Configured')).toBeVisible()
  })

  test('should configure rate limits', async ({ page }) => {
    // Find rate limit inputs
    const requestsInput = page.getByLabel(/Requests per minute/)
    const windowInput = page.getByLabel(/Window \(ms\)/)
    
    // Should have default values
    await expect(requestsInput).toHaveValue('60')
    await expect(windowInput).toHaveValue('60000')
    
    // Change values
    await requestsInput.fill('100')
    await windowInput.fill('30000')
    
    // Values should be updated
    await expect(requestsInput).toHaveValue('100')
    await expect(windowInput).toHaveValue('30000')
  })

  test('should show available models for each provider', async ({ page }) => {
    // OpenAI models
    await expect(page.getByText('gpt-4')).toBeVisible()
    await expect(page.getByText('gpt-4-turbo')).toBeVisible()
    await expect(page.getByText('gpt-3.5-turbo')).toBeVisible()
    
    // Switch to Anthropic
    await page.getByRole('tab', { name: 'Anthropic' }).click()
    
    // Anthropic models
    await expect(page.getByText('claude-3-opus')).toBeVisible()
    await expect(page.getByText('claude-3-sonnet')).toBeVisible()
    await expect(page.getByText('claude-3-haiku')).toBeVisible()
    
    // Switch to Google AI
    await page.getByRole('tab', { name: 'Google AI' }).click()
    
    // Google AI models
    await expect(page.getByText('gemini-pro')).toBeVisible()
    await expect(page.getByText('gemini-pro-vision')).toBeVisible()
  })

  test('should handle provider enable/disable', async ({ page }) => {
    // Mock existing configuration
    await page.route('/api/config/validate', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            configs: {
              openai: {
                apiKey: 'sk-existing-key',
                models: ['gpt-4'],
                rateLimits: { requests: 60, window: 60000 },
                isActive: true,
              },
            },
          }),
        })
      }
    })
    
    // Reload page to get mock config
    await page.reload()
    
    // Should show configured status
    await expect(page.getByText('Configured')).toBeVisible()
    
    // Should show disable button
    await expect(page.getByRole('button', { name: /Disable/i })).toBeVisible()
    
    // Click disable
    await page.getByRole('button', { name: /Disable/i }).click()
    
    // Button should change to enable
    await expect(page.getByRole('button', { name: /Enable/i })).toBeVisible()
  })

  test('should handle multiple provider configurations', async ({ page }) => {
    // Configure OpenAI
    await page.getByLabel(/API Key/).fill('sk-openai-key')
    await page.getByRole('button', { name: /Test & Validate/i }).click()
    
    // Mock validation for OpenAI
    await page.route('/api/config/validate', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { apiKey: 'sk-openai-key', models: ['gpt-4'], rateLimits: { requests: 60, window: 60000 }, isActive: true },
          connectionTest: { success: true, latency: 150 },
        }),
      })
    })
    
    // Switch to Anthropic and configure
    await page.getByRole('tab', { name: 'Anthropic' }).click()
    await page.getByLabel(/API Key/).fill('ant-anthropic-key')
    
    // Each provider should maintain its own state
    await page.getByRole('tab', { name: 'OpenAI' }).click()
    await expect(page.getByLabel(/API Key/)).toHaveValue('sk-openai-key')
    
    await page.getByRole('tab', { name: 'Anthropic' }).click()
    await expect(page.getByLabel(/API Key/)).toHaveValue('ant-anthropic-key')
  })

  test('should show loading states', async ({ page }) => {
    // Mock slow API response
    await page.route('/api/config/validate', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {}, connectionTest: { success: true } }),
      })
    })
    
    await page.getByLabel(/API Key/).fill('sk-test-key')
    await page.getByRole('button', { name: /Test & Validate/i }).click()
    
    // Should show testing state
    await expect(page.getByText(/Testing.../i)).toBeVisible()
    
    // Button should be disabled during testing
    await expect(page.getByRole('button', { name: /Testing.../i })).toBeDisabled()
  })

  test('should persist configuration across page refreshes', async ({ page }) => {
    // Mock saved configuration
    await page.route('/api/config/validate', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            configs: {
              openai: {
                apiKey: 'sk-persisted-key',
                models: ['gpt-4'],
                rateLimits: { requests: 100, window: 30000 },
                isActive: true,
              },
            },
          }),
        })
      }
    })
    
    await page.reload()
    
    // Should load saved configuration
    await expect(page.getByLabel(/API Key/)).toHaveValue('sk-persisted-key')
    await expect(page.getByLabel(/Requests per minute/)).toHaveValue('100')
    await expect(page.getByLabel(/Window \(ms\)/)).toHaveValue('30000')
    await expect(page.getByText('Configured')).toBeVisible()
  })
})