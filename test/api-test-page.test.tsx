import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import ApiTestPage from '@/app/api-test/page'

afterEach(() => vi.unstubAllGlobals())

const run = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Test API Connection' }))

it('verifies a typed key against the real verification route and reports the verdict', async () => {
  const fetch = vi.fn().mockResolvedValue(
    Response.json({ valid: true, message: 'API key verified successfully.', reason: 'ok', latencyMs: 120 }),
  )
  vi.stubGlobal('fetch', fetch)
  const user = userEvent.setup()
  render(<ApiTestPage />)
  expect(screen.getByText('OpenAI: Not tested')).toBeInTheDocument()
  await user.type(screen.getByLabelText('API key (optional)'), '  sk-live-example-key  ')
  await run(user)
  expect(await screen.findByRole('status')).toHaveTextContent('API key verified successfully.')
  expect(screen.getByText('Provider responded in 120 ms.')).toBeInTheDocument()
  expect(screen.getByText('OpenAI: Connected')).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][0]).toBe('/api/test-api-key')
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ provider: 'openai', apiKey: 'sk-live-example-key' })
})

it('verifies the saved key when no key is typed', async () => {
  const fetch = vi.fn().mockResolvedValue(
    Response.json({ valid: false, message: 'No saved API key found for this provider.', reason: 'invalid' }),
  )
  vi.stubGlobal('fetch', fetch)
  const user = userEvent.setup()
  render(<ApiTestPage />)
  await user.selectOptions(screen.getByLabelText('Provider'), 'anthropic')
  await run(user)
  expect(await screen.findByRole('alert')).toHaveTextContent('No saved API key found for this provider.')
  expect(screen.getByText('Claude (Anthropic): Disconnected')).toBeInTheDocument()
  expect(screen.getByText('OpenAI: Not tested')).toBeInTheDocument()
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ provider: 'anthropic', testSaved: true })
})

it('never reports a connection when the provider rejects the key', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    Response.json({ valid: false, message: 'Provider rejected this API key.', reason: 'invalid', latencyMs: 80 }),
  ))
  const user = userEvent.setup()
  render(<ApiTestPage />)
  await user.type(screen.getByLabelText('API key (optional)'), 'sk-bad-key-000000')
  await run(user)
  expect(await screen.findByRole('alert')).toHaveTextContent('Provider rejected this API key.')
  expect(screen.queryByText('OpenAI: Connected')).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('leaves the status untested when the check is throttled or the service fails', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ valid: false, message: 'Too many requests. Please wait a moment and try again.', reason: 'rate_limited' }, { status: 429 }),
    )
    .mockRejectedValueOnce(new Error('network down'))
    .mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }))
  vi.stubGlobal('fetch', fetch)
  const user = userEvent.setup()
  render(<ApiTestPage />)
  await user.type(screen.getByLabelText('API key (optional)'), 'sk-live-example-key')

  await run(user)
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests')
  expect(screen.getByText('OpenAI: Not tested')).toBeInTheDocument()

  await run(user)
  expect(await screen.findByText(/could not be reached\. Nothing was tested/)).toBeInTheDocument()
  expect(screen.getByText('OpenAI: Not tested')).toBeInTheDocument()

  await run(user)
  expect(await screen.findByText(/could not be reached\. Nothing was tested/)).toBeInTheDocument()
  expect(screen.getByText('OpenAI: Not tested')).toBeInTheDocument()
})

it('contains no simulated result path', () => {
  vi.stubGlobal('fetch', vi.fn())
  render(<ApiTestPage />)
  expect(document.body.textContent?.toLowerCase()).not.toContain('simulated')
})
