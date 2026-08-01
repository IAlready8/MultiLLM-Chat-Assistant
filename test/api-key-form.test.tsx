import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

import ApiKeyForm from '@/components/api-key-form'

describe('ApiKeyForm credentialless providers', () => {
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

  it('shows the DeepSeek public-endpoint warning without a key input', async () => {
    render(<ApiKeyForm />)

    expect(
      screen.getByText('DeepSeek V4 Community Connection'),
    ).toBeVisible()
    expect(
      screen.getByRole('note'),
    ).toHaveTextContent(
      'No API key required. This shared public endpoint is experimental; never submit private or sensitive data.',
    )
    expect(document.getElementById('deepseek-api-key')).toBeNull()

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/config'))
  })
})
