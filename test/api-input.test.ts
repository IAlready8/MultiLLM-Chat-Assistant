import { describe, expect, it } from 'vitest'
import { readApiObject } from '@/lib/api-input'
describe('shared JSON mutation boundary', () => {
  it.each(['{', 'null', '[]'])('returns a client error for invalid object input %s', async body => {
    const result = await readApiObject(new Request('http://localhost', { method: 'POST', body }))
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(400)
  })
  it('rejects oversized bodies without echoing data', async () => {
    const result = await readApiObject(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ key: 's'.repeat(1_048_576) }) }))
    expect((result as Response).status).toBe(413)
  })
})
