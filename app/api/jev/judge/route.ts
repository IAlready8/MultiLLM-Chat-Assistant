import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { jevChoose, getJevApiKey, JevError } from '@/lib/jev'
import { getUserApiKey } from '@/lib/api-key-service'
import { LlmRequestError, readBoundedJson } from '@/lib/llm-request'
import { checkAndConsume } from '@/lib/rate-limit'
import prisma from '@/lib/prisma'
import { z } from 'zod'

export const maxDuration = 30

// 10 options x 10,000 characters + a 10,000 character state, with JSON and
// multi-byte headroom. Larger bodies are rejected before parsing.
const MAX_JUDGE_BODY_BYTES = 256_000

const judgeSchema = z.object({
  state: z.string().min(1).max(10000),
  question: z.string().min(1).max(500).default('Which response is the best?'),
  options: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        label: z.string().min(1).max(200),
        content: z.string().min(1).max(10000),
      }),
    )
    .min(2)
    .max(10),
})

function jevErrorResponse(error: JevError) {
  // Upstream rate limiting is passed through so the client can retry later.
  // Every other upstream failure, including Jev rejecting the key (401/403),
  // is reported as 502: a 401 from this route must only ever mean that the
  // caller's own session is invalid.
  const status = error.statusCode === 429 ? 429 : 502
  return NextResponse.json({ error: error.message, code: error.code }, { status })
}

/**
 * POST /api/jev/judge
 *
 * Opt-in Jev-powered response judging. Only works when the user has
 * configured a Jev API key and enabled judging in settings.
 */
export async function POST(request: Request) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const limit = await checkAndConsume(`jev-judge:${user.id}`, { max: 20, windowMs: 60_000 })
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await readBoundedJson(request, MAX_JUDGE_BODY_BYTES)
  } catch (error) {
    if (error instanceof LlmRequestError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = judgeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { state, question, options } = parsed.data

  // Load Jev config
  const config = await prisma.providerConfig.findUnique({
    where: { userId_provider: { userId: user.id, provider: 'jev' } },
  })

  if (!config) {
    return NextResponse.json(
      { error: 'Jev is not configured. Add your API key in Settings.' },
      { status: 400 },
    )
  }

  // Check enabled flag in settings JSON
  let enabled = false
  try {
    const settings = config.settings ? JSON.parse(config.settings) : {}
    enabled = settings.jevJudgingEnabled === true
  } catch {
    enabled = false
  }

  if (!enabled) {
    return NextResponse.json(
      { error: 'Jev judging is disabled. Enable it in Settings.' },
      { status: 400 },
    )
  }

  if (!config.isActive) {
    return NextResponse.json(
      { error: 'Jev configuration is inactive.' },
      { status: 400 },
    )
  }

  // The user's own decrypted key wins; a server-wide key is only a fallback.
  const apiKey = await getUserApiKey(user.id, 'jev')

  const resolvedKey = getJevApiKey(apiKey)
  if (!resolvedKey) {
    return NextResponse.json(
      { error: 'No Jev API key configured.' },
      { status: 400 },
    )
  }

  const contents: Record<string, string> = {}
  for (const opt of options) {
    contents[opt.id] = opt.content
  }

  try {
    const result = await jevChoose(
      resolvedKey,
      {
        state,
        question,
        options: options.map((o) => ({ id: o.id, label: o.label })),
        contents,
      },
      request.signal,
    )

    return NextResponse.json({
      winnerId: result.winnerId,
      winnerLabel: result.winnerLabel,
      probabilities: result.probabilities,
      confidence: result.confidence,
      judgedBy: 'jev',
      model: result.model,
    })
  } catch (error) {
    if (error instanceof JevError) {
      return jevErrorResponse(error)
    }
    return NextResponse.json(
      { error: 'Jev judging failed' },
      { status: 502 },
    )
  }
}
