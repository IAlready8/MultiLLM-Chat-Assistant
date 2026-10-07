import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
const mocks = vi.hoisted(() => ({ page: vi.fn(), messages: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: { getConversationPage: mocks.page, getConversationMessages: mocks.messages } }))
import ComparisonPage from '@/app/comparison/page'

const sample = (content: string) => ({ messages: [
  { role: 'user', content: `${content} prompt` },
  { role: 'assistant', content, provider: 'openai', model: 'gpt-4o' },
] })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ providerData: [], modelComparisonData: [], meta: { source: 'empty' } }) }))
  mocks.page.mockResolvedValue({ items: [{ id: 'first', title: 'First chat' }, { id: 'second', title: 'Second chat' }], nextCursor: null })
})

async function openComparison() {
  const user = userEvent.setup()
  render(<ComparisonPage />)
  await user.click(await screen.findByRole('tab', { name: 'Response Comparison' }))
  return user
}

describe('saved response comparison', () => {
  it('loads one complete latest turn and keeps the most recent response for each model', async () => {
    const data = sample('Older answer')
    data.messages.push({ role: 'assistant', content: 'Regenerated answer', provider: 'openai', model: 'gpt-4o' })
    mocks.messages.mockResolvedValue(data)
    await openComparison()
    expect(await screen.findByText('Regenerated answer')).toBeVisible()
    expect(screen.queryByText('Older answer')).not.toBeInTheDocument()
    expect(mocks.messages).toHaveBeenCalledWith('first', undefined, 1)
  })

  it.each(['success', 'failure'])('ignores a stale %s after switching conversations', async outcome => {
    let resolveFirst!: (value: ReturnType<typeof sample>) => void
    let rejectFirst!: (reason: Error) => void
    mocks.messages.mockImplementation((id: string) => id === 'first'
      ? new Promise((resolve, reject) => { resolveFirst = resolve; rejectFirst = reject })
      : Promise.resolve(sample('Current answer')))
    const user = await openComparison()
    await user.selectOptions(screen.getByLabelText('Conversation to compare'), 'second')
    expect(await screen.findByText('Current answer')).toBeVisible()
    await act(async () => {
      if (outcome === 'success') resolveFirst(sample('Stale answer'))
      else rejectFirst(new Error('Stale failure'))
    })
    expect(screen.getByText('Current answer')).toBeVisible()
    expect(screen.queryByText('Stale answer')).not.toBeInTheDocument()
    expect(screen.queryByText('Stale failure')).not.toBeInTheDocument()
    expect(screen.queryByText('Loading responses...')).not.toBeInTheDocument()
  })

  it('retries a failed selected conversation without reloading the page', async () => {
    mocks.messages.mockRejectedValueOnce(new Error('History unavailable')).mockResolvedValue(sample('Recovered answer'))
    const user = await openComparison()
    expect(await screen.findByText('History unavailable')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Retry responses' }))
    expect(await screen.findByText('Recovered answer')).toBeVisible()
    await waitFor(() => expect(screen.queryByText('History unavailable')).not.toBeInTheDocument())
  })
})
