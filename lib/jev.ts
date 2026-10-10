/**
 * TypeSafe AI Jev client — decision model for structured judgments.
 *
 * Jev is NOT a chat LLM. It answers typed questions (choice/score/yes-no)
 * with calibrated probabilities. Used here for opt-in response judging.
 *
 * API: https://api.typesafe.ai/v1/systemone
 * Pricing: ~$0.042/M input tokens, output free (as of Oct 2026)
 */

import { logger } from '@/lib/logger'

const JEV_API_BASE = 'https://api.typesafe.ai/v1'
const JEV_MODEL = 'jev-1.13.0'

export interface JevChoiceOption {
  id: string
  label: string
}

export interface JevChoiceResult {
  winnerId: string
  winnerLabel: string
  probabilities: Record<string, number>
  confidence: number
}

export interface JevJudgeRequest {
  /** The question/context being judged (e.g., the original prompt) */
  state: string
  /** The question to answer (e.g., "Which response is best?") */
  question: string
  /** The options to choose from */
  options: JevChoiceOption[]
  /** Response contents keyed by option id, for context */
  contents: Record<string, string>
}

export class JevError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'JevError'
  }
}

/**
 * Call Jev's Choice primitive to pick the best option.
 * Returns winner with probability distribution and confidence.
 */
export async function jevChoose(
  apiKey: string,
  request: JevJudgeRequest,
): Promise<JevChoiceResult> {
  const state = buildState(request)

  const response = await fetch(`${JEV_API_BASE}/systemone`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: JEV_MODEL,
      state,
      questions: [
        {
          type: 'choice',
          id: 'best_response',
          question: request.question,
          options: request.options.map((o) => o.id),
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const status = response.status
    if (status === 401 || status === 403) {
      throw new JevError('Invalid Jev API key', 'JEV_AUTH_FAILED', status)
    }
    if (status === 402) {
      throw new JevError('Jev quota exceeded', 'JEV_QUOTA_EXCEEDED', status)
    }
    if (status === 429) {
      throw new JevError('Jev rate limited, try again shortly', 'JEV_RATE_LIMITED', status)
    }
    throw new JevError(
      `Jev API error: ${status}`,
      'JEV_API_ERROR',
      status,
    )
  }

  const data = await response.json()
  const answer = data.answers?.best_response

  if (!answer || !answer.choice) {
    logger.warn('jev_invalid_response')
    throw new JevError('Invalid response from Jev', 'JEV_INVALID_RESPONSE')
  }

  const winnerId = answer.choice
  const winner = request.options.find((o) => o.id === winnerId)

  if (!winner) {
    throw new JevError('Jev returned unknown option', 'JEV_INVALID_RESPONSE')
  }

  return {
    winnerId,
    winnerLabel: winner.label,
    probabilities: answer.probabilities ?? {},
    confidence: answer.confidence ?? 0,
  }
}

function buildState(request: JevJudgeRequest): string {
  const parts = [`Context: ${request.state}`, '', 'Responses to judge:']
  for (const option of request.options) {
    const content = request.contents[option.id] ?? ''
    // Truncate long responses to keep token usage reasonable
    const truncated =
      content.length > 2000 ? content.slice(0, 2000) + '...[truncated]' : content
    parts.push(`--- ${option.label} ---`, truncated, '')
  }
  return parts.join('\n')
}

/**
 * Check if a Jev API key is configured (via env or user settings).
 * Env var takes precedence for server-wide configuration.
 */
export function getJevApiKey(userKey?: string | null): string | null {
  if (process.env.JEV_API_KEY?.trim()) {
    return process.env.JEV_API_KEY.trim()
  }
  if (userKey?.trim()) {
    return userKey.trim()
  }
  return null
}
