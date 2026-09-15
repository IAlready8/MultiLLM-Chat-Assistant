import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { checkAndConsume } from '@/lib/rate-limit'
import { llmErrorResponse } from '@/lib/llm-runtime'
import { LlmRequestError } from '@/lib/llm-request'
import { exportAccountHistory } from '@/services/account-export-service'

export const maxDuration = 30

export async function POST() {
  const auth = await getAuthenticatedUser()
  if (auth instanceof NextResponse) return auth
  try {
    const limit = await checkAndConsume(`account-export:${auth.user.id}`, { max: 3, windowMs: 900_000 })
    if (!limit.allowed) throw new LlmRequestError('Please wait before creating another archive.', 429, 'RATE_LIMITED', Math.max(1, Math.ceil(limit.retryAfterMs / 1000)))
    return new Response(await exportAccountHistory(auth.user.id), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (error) { return llmErrorResponse(error) }
}
