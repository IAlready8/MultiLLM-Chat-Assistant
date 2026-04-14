/**
 * app/api/llm/models/route.ts
 *
 * GET /api/llm/models
 *
 * Returns the model catalog for one or all providers.
 *
 * Query params:
 *   provider - Optional. One of the registered provider IDs.
 *              If provided, returns models for that provider only.
 *              If omitted, returns the full catalog keyed by provider.
 *
 * Examples:
 *   GET /api/llm/models
 *     -> { catalog: { openai: [...], anthropic: [...], ... } }
 *
 *   GET /api/llm/models?provider=openai
 *     -> { provider: "openai", models: [...] }
 *
 *   GET /api/llm/models?provider=unknown
 *     -> 400 { error: "Unknown provider: unknown", code: "UNKNOWN_PROVIDER" }
 *
 * Auth:
 *   Requires a valid session. Returns 401 in strict auth mode when unauthenticated.
 *   Allows guest access in non-strict mode so the model picker works before login.
 *
 * Caching:
 *   The catalog is static (no DB call). We set Cache-Control headers to allow
 *   edge/browser caching for 60 seconds to reduce redundant requests from pages
 *   that mount the model picker on every render.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import {
  MODEL_CATALOG,
  getModelsForProvider,
  getAllProviderIds,
} from '@/lib/model-catalog'
import type { ModelsResponse } from '@/types/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_SECONDS = 60

function jsonOk(body: ModelsResponse): NextResponse {
  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 5}`,
    },
  })
}

function jsonError(status: number, error: string, code: string): NextResponse {
  return new NextResponse(JSON.stringify({ error, code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// GET /api/llm/models
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Auth check - allow guest so model picker works in demo mode
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck

  const { searchParams } = req.nextUrl
  const providerParam = searchParams.get('provider')

  // Full catalog - no provider filter
  if (!providerParam) {
    return jsonOk({ catalog: MODEL_CATALOG })
  }

  // Validate provider
  const provider = providerParam.trim().toLowerCase()
  const knownProviders = getAllProviderIds()
  if (!knownProviders.includes(provider)) {
    return jsonError(
      400,
      `Unknown provider: ${provider}. Supported: ${knownProviders.join(', ')}`,
      'UNKNOWN_PROVIDER',
    )
  }

  const models = getModelsForProvider(provider)
  return jsonOk({ provider, models })
}
