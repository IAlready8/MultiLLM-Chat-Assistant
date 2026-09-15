import { reserveLlmQuota } from '@/lib/llm-quota'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { parseLlmInput, readBoundedJson } from '@/lib/llm-request'
import { createCompletionStream, executeChat, llmErrorResponse, prepareProviderCall } from '@/lib/llm-runtime'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser()
    if (auth instanceof NextResponse) return auth
    const input = parseLlmInput(await readBoundedJson(request), 'openai')
    if (input.stream === false) {
      return NextResponse.json(await executeChat(auth.user.id, input, request.signal))
    }
    const controller = new AbortController()
    const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(45_000)])
    const call = await prepareProviderCall(auth.user.id, input, signal)
    await reserveLlmQuota(auth.user.id)
    return new Response(createCompletionStream(call, input.provider, auth.user.id, controller, false), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return llmErrorResponse(error)
  }
}
