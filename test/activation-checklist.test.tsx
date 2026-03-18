import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import { ActivationChecklist } from '@/components/activation-checklist'

const fetchMock = vi.fn()

describe('ActivationChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('shows a neutral loading state before activation data resolves', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<ActivationChecklist />)

    expect(screen.getByText('Loading progress')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Checking progress' })
    ).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Checking setup' })).toHaveLength(3)
  })

  it('advances the next action after activation data loads', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        configuredProviders: 1,
        personas: 0,
        comparisonReadyConversations: 0,
      }),
    })

    render(<ActivationChecklist />)

    await screen.findByText('1/3 complete')
    expect(screen.getByText('Next best action: Create a persona')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue activation' })).toHaveAttribute(
      'href',
      '/personas'
    )
  })

  it('falls back to setup review when activation data fails to load', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'unavailable' }),
    })

    render(<ActivationChecklist />)

    await waitFor(() => {
      expect(
        screen.getByText('Unable to load activation progress right now.')
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: 'Review setup' })).toHaveAttribute(
      'href',
      '/settings'
    )
    consoleSpy.mockRestore()
  })
})
