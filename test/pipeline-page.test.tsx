import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
const mocks = vi.hoisted(() => ({ page: vi.fn(), create: vi.fn(), run: vi.fn(), load: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: { getConversationPage: mocks.page, createConversation: mocks.create, orchestrateWithMetadata: mocks.run, getConversationMessages: mocks.load } }))
import PipelinePage from '@/app/pipeline/page'
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ configuredProviders: ['openai'] }) }))
  mocks.page.mockResolvedValue({ items: [], nextCursor: null })
  mocks.create.mockResolvedValue({ id: 'saved-run', title: 'Pipeline: Compare' })
  mocks.run.mockResolvedValue({ results: [{ provider: 'openai', model: 'gpt-4o', content: 'Saved answer', prompt_tokens: 1, completion_tokens: 2, latency_ms: 10, cost_usd: null, status: 'complete' }], fallbackMode: 'native' })
})
describe('durable pipeline workspace', () => {
  it('opens a saved run through a bounded complete-turn read without generating', async () => {
    mocks.page.mockResolvedValue({ items: [{ id: 'run-1', title: 'Pipeline: Saved run' }], nextCursor: null })
    mocks.load.mockResolvedValue({ messages: [
      { role: 'user', content: 'Saved prompt' },
      { role: 'assistant', content: 'Persisted result', provider: 'openai', model: 'gpt-4o', generationStatus: 'complete' },
    ] })
    const user = userEvent.setup()
    render(<PipelinePage />)
    await user.click(screen.getByText(/Saved pipeline runs/))
    await user.click(await screen.findByRole('button', { name: 'Pipeline: Saved run' }))
    expect(await screen.findByText('Persisted result')).toBeVisible()
    expect(screen.getByLabelText('Pipeline prompt')).toHaveValue('Saved prompt')
    expect(mocks.load).toHaveBeenCalledWith('run-1', undefined, 1)
    expect(mocks.run).not.toHaveBeenCalled()
  })
  it('prevents editing or generation while a saved run is loading', async () => {
    mocks.page.mockResolvedValue({ items: [{ id: 'run-1', title: 'Pipeline: Pending' }], nextCursor: null })
    let complete!: (value: { messages: { role: string; content: string }[] }) => void
    mocks.load.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    const user = userEvent.setup()
    render(<PipelinePage />)
    await user.click(screen.getByText(/Saved pipeline runs/))
    await user.click(await screen.findByRole('button', { name: 'Pipeline: Pending' }))
    expect(screen.getByLabelText('Pipeline prompt')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Run Orchestration' })).toBeDisabled()
    await act(async () => complete({ messages: [{ role: 'user', content: 'Restored prompt' }] }))
    expect(screen.getByLabelText('Pipeline prompt')).toHaveValue('Restored prompt')
    expect(screen.getByLabelText('Pipeline prompt')).toBeEnabled()
    expect(mocks.run).not.toHaveBeenCalled()
  })
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
