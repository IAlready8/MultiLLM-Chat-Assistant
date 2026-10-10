import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { jevChoose, getJevApiKey, JevError } from '@/lib/jev'
import { decryptApiKey } from '@/lib/encryption'
import prisma from '@/lib/prisma'
import { z } from 'zod'

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

  let body: unknown
  try {
    body = await request.json()
  } catch {
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

  // Decrypt API key
  let apiKey: string | null = null
  try {
    apiKey = config.apiKey ? decryptApiKey(config.apiKey) : null
  } catch {
    return NextResponse.json(
      { error: 'Failed to decrypt Jev API key. Re-enter it in Settings.' },
      { status: 500 },
    )
  }

  const resolvedKey = getJevApiKey(apiKey)
  if (!resolvedKey) {
    return NextResponse.json(
      { error: 'No Jev API key configured.' },
      { status: 400 },
    )
  }

  // Build Jev request
  const contents: Record<string, string> = {}
  for (const opt of options) {
    contents[opt.id] = opt.content
  }

  try {
    const result = await jevChoose(resolvedKey, {
      state,
      question,
      options: options.map((o) => ({ id: o.id, label: o.label })),
      contents,
    })

    return NextResponse.json({
      winnerId: result.winnerId,
      winnerLabel: result.winnerLabel,
      probabilities: result.probabilities,
      confidence: result.confidence,
      judgedBy: 'jev',
      model: 'jev-1.13.0',
    })
  } catch (error) {
    if (error instanceof JevError) {
      const status = error.statusCode ?? 500
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: status >= 400 && status < 600 ? status : 500 },
      )
    }
    return NextResponse.json(
      { error: 'Jev judging failed' },
      { status: 500 },
    )
  }
}
