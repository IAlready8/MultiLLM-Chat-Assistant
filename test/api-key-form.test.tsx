import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

import ApiKeyForm from '@/components/api-key-form'

describe('ApiKeyForm DeepSeek BYOK configuration', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ configuredProviders: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows an official provider-billed DeepSeek password input', async () => {
    render(<ApiKeyForm />)

    expect(screen.getByText('DeepSeek API Key')).toBeVisible()
    expect(screen.getByText(/Official BYOK API/)).toBeVisible()
    expect(screen.getByText(/billed by DeepSeek/)).toBeVisible()
    expect(screen.getByPlaceholderText('DeepSeek API key')).toHaveAttribute(
      'type',
      'password',
    )

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/config'))
  })
})
