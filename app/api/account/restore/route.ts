import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { apiReadCacheKey, invalidateApiReadCache } from '@/lib/api-read-cache'
import { checkAndConsume } from '@/lib/rate-limit'
import { llmErrorResponse } from '@/lib/llm-runtime'
import { LlmRequestError, readBoundedJson } from '@/lib/llm-request'
import { ACCOUNT_RESTORE_MAX_BYTES, restoreAccountHistory } from '@/services/account-restore-service'

export const maxDuration = 30
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser()
  if (auth instanceof NextResponse) return auth
  try {
    const limit = await checkAndConsume(`account-restore:${auth.user.id}`, { max: 3, windowMs: 900_000 })
    if (!limit.allowed) throw new LlmRequestError('Please wait before restoring another archive.', 429, 'RATE_LIMITED', Math.max(1, Math.ceil(limit.retryAfterMs / 1000)))
    const result = await restoreAccountHistory(auth.user.id, await readBoundedJson(request, ACCOUNT_RESTORE_MAX_BYTES))
    invalidateApiReadCache(apiReadCacheKey('/api/conversations', auth.user.id))
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (!(error instanceof LlmRequestError)) {
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN'
      console.error('account_restore_failed', { code })
    }
    return llmErrorResponse(error)
  }
}
