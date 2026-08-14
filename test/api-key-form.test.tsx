import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

import ApiKeyForm from '@/components/api-key-form'

describe('ApiKeyForm operational providers', () => {
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

  it('does not offer disabled DeepSeek or request a DeepSeek API key', async () => {
    render(<ApiKeyForm />)

    expect(screen.getByText('OpenAI API Key')).toBeVisible()
    expect(screen.queryByText(/DeepSeek/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Free Community/i)).not.toBeInTheDocument()
    expect(document.getElementById('deepseek-api-key')).toBeNull()

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/config'))
  })
})
