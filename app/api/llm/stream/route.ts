import { after, NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { parseLlmInput, readBoundedJson } from '@/lib/llm-request'
import { createCompletionStream, llmErrorResponse, prepareProviderCall } from '@/lib/llm-runtime'

import { beginGeneration, checkpointGeneration, finishGeneration } from '@/services/generation-service'
import type { SavedGenerationInput } from '@/services/generation-service'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const input = parseLlmInput(await readBoundedJson(request))
    const auth = await getAuthenticatedUser()
    if (auth instanceof NextResponse) return auth
    const controller = new AbortController()
    const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(45_000)])
    const call = await prepareProviderCall(auth.user.id, input, signal)
    let persistence: Parameters<typeof createCompletionStream>[5]
    if (input.conversationId) {
      const generation = await beginGeneration(auth.user.id, input as SavedGenerationInput)
      if (generation.replay !== null) {
        return new Response(JSON.stringify({ type: 'chunk', content: generation.replay }) + '\n' + JSON.stringify({ type: 'done', replay: true }) + '\n', {
          headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
        })
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
    return new Response(createCompletionStream(call, input.provider, auth.user.id, controller, true, persistence), {
      headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return llmErrorResponse(error)
  }
}
