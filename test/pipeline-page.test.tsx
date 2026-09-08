import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
const mocks = vi.hoisted(() => ({ page: vi.fn(), create: vi.fn(), run: vi.fn(), load: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: { getConversationPage: mocks.page, createConversation: mocks.create, orchestrateWithMetadata: mocks.run, getConversation: mocks.load } }))
import PipelinePage from '@/app/pipeline/page'
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configuredProviders: ['openai'] }) }))
  mocks.page.mockResolvedValue({ items: [], nextCursor: null })
  mocks.create.mockResolvedValue({ id: 'saved-run', title: 'Pipeline: Compare' })
  mocks.run.mockResolvedValue({ results: [{ provider: 'openai', model: 'gpt-4o', content: 'Saved answer', prompt_tokens: 1, completion_tokens: 2, latency_ms: 10, cost_usd: null, status: 'complete' }], fallbackMode: 'native' })
})
describe('durable pipeline workspace', () => {
  it('saves the prompt before dispatch and connects result identities to history', async () => {
    const user = userEvent.setup()
    render(<PipelinePage />)
    await user.type(screen.getByLabelText('Pipeline prompt'), 'Compare')
    await user.click(await screen.findByRole('button', { name: 'Run Orchestration' }))
    expect(await screen.findByText('Saved answer')).toBeVisible()
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.run.mock.invocationCallOrder[0])
    expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'saved-run', turnId: expect.any(String), requests: [expect.objectContaining({ requestId: expect.any(String) })] }))
  })
  it('does not generate when saving the prompt fails', async () => {
    const user = userEvent.setup()
    mocks.create.mockRejectedValue(new Error('Save unavailable'))
    render(<PipelinePage />)
    await user.type(screen.getByLabelText('Pipeline prompt'), 'Retain this prompt')
    await user.click(await screen.findByRole('button', { name: 'Run Orchestration' }))
    expect(await screen.findByText('Save unavailable')).toBeVisible()
    expect(mocks.run).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Pipeline prompt')).toHaveValue('Retain this prompt')
  })
})
