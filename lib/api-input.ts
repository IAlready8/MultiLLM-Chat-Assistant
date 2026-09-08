import { NextResponse } from 'next/server'
import { LlmRequestError, readBoundedJson } from '@/lib/llm-request'

export async function readApiObject(request: Request): Promise<Record<string, unknown> | NextResponse> {
  try {
    const value = await readBoundedJson(request)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LlmRequestError('Request body must be an object')
    return value as Record<string, unknown>
  } catch (error) {
    if (error instanceof LlmRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    return NextResponse.json({ error: 'Unable to read request body' }, { status: 400 })
  }
}
