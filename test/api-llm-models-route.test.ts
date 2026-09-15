import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from '@/app/api/llm/models/route'
import { MODEL_CATALOG } from '@/lib/model-catalog'
import { operationalProviderRegistry } from '@/lib/provider-registry'

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}))

describe('/api/llm/models route', () => {
  it('returns a catalog entry for every operational provider', async () => {
    const response = await GET(new NextRequest('http://localhost/api/llm/models'))
    const body = await response.json()
    const registeredProviderIds = operationalProviderRegistry.map(provider => provider.id)

    expect(response.status).toBe(200)
    expect(Object.keys(body.catalog).sort()).toEqual(
      [...registeredProviderIds].sort()
    )

    for (const providerId of registeredProviderIds) {
      expect(body.catalog[providerId]).toEqual(MODEL_CATALOG[providerId])
      expect(body.catalog[providerId].length).toBeGreaterThan(0)
    }
  })

  it('returns a sanitized disabled response for DeepSeek', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/llm/models?provider=deepseek')
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'DeepSeek is currently unavailable.',
      code: 'PROVIDER_DISABLED',
    })
  })

  it('returns models for one registered provider', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/llm/models?provider=mistral')
    )

    await expect(response.json()).resolves.toEqual({
      provider: 'mistral',
      models: MODEL_CATALOG.mistral,
    })
    expect(response.status).toBe(200)
  })

  it('rejects unknown providers', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/llm/models?provider=unknown')
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.code).toBe('UNKNOWN_PROVIDER')
  })
})
