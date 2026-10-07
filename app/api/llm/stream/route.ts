import { reserveLlmQuota } from '@/lib/llm-quota'
import { after, NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { parseGenerationInput, readBoundedJson, usesServerHistory, type LlmInput } from '@/lib/llm-request'
import { createCompletionStream, llmErrorResponse, prepareProviderCall } from '@/lib/llm-runtime'
import { assembleServerHistory } from '@/services/conversation-context'
import { beginGeneration, checkpointGeneration, finishGeneration } from '@/services/generation-service'
import type { SavedGenerationInput } from '@/services/generation-service'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const parsed = parseGenerationInput(await readBoundedJson(request))
    const auth = await getAuthenticatedUser()
    if (auth instanceof NextResponse) return auth
    const headers: Record<string, string> = { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' }
    let input: LlmInput
    if (usesServerHistory(parsed)) {
      // Ownership and turn existence are verified before any provider work.
      const context = await assembleServerHistory(auth.user.id, parsed)
      const { history: _history, ...generation } = parsed
      void _history
      input = { ...generation, messages: context.messages }
      headers['X-Context-Included-Turns'] = String(context.includedTurns)
      headers['X-Context-Omitted-Turns'] = String(context.omittedTurns)
      headers['X-Context-Truncated'] = String(context.truncated)
    } else {
      input = parsed
    }
    const controller = new AbortController()
    const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(45_000)])
    const call = await prepareProviderCall(auth.user.id, input, signal)
    let persistence: Parameters<typeof createCompletionStream>[5]
    if (input.conversationId) {
      // Server-history replays are keyed by client intent, not by the context
      // snapshot, so a transport retry still replays after history changes.
      const generation = await beginGeneration(auth.user.id, (usesServerHistory(parsed) ? parsed : input) as SavedGenerationInput)
      if (generation.replay !== null) {
        return new Response(JSON.stringify({ type: 'chunk', content: generation.replay }) + '\n' + JSON.stringify({ type: 'done', replay: true }) + '\n', { headers })
      }
      let settled!: () => void
      const completion = new Promise<void>(resolve => { settled = resolve })
      after(() => completion)
      persistence = {
        checkpoint: (content, usage) => checkpointGeneration(auth.user.id, generation.id, content, usage),
        finish: (content, status, usage) => finishGeneration(auth.user.id, generation.id, content, status, usage),
        settled,
      }
    }
    try { await reserveLlmQuota(auth.user.id) } catch (error) {
      try { await persistence?.finish('', 'failed', { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, usage_source: 'estimated' }) } finally { persistence?.settled() }
      throw error
    }
    return new Response(createCompletionStream(call, input.provider, auth.user.id, controller, true, persistence), { headers })
  } catch (error) {
    return llmErrorResponse(error)
  }
}
