/**
 * TypeSafe AI Jev client for opt-in roundtable response judging.
 *
 * Jev is NOT a chat LLM. It answers typed questions (choice/score/yes-no)
 * with calibrated probabilities. The HTTP request itself is made by the
 * shared client in lib/decision/jev.ts so there is exactly one request
 * contract for https://api.typesafe.ai/v1/systemone.
 */

import { JevUnavailableError, requestJevChoice } from '@/lib/decision/jev'

/** Pinned Jev release used for judging (a documented bare model name). */
export const JEV_JUDGE_MODEL = 'jev-1.13.0'
const JEV_JUDGE_TIMEOUT_MS = 20_000
const MAX_RESPONSE_CHARS_PER_OPTION = 2000

export interface JevChoiceOption {
  id: string
  label: string
}

export interface JevChoiceResult {
  winnerId: string
  winnerLabel: string
  probabilities: Record<string, number>
  confidence: number
  model: string
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

function toJevError(error: unknown): JevError {
  if (error instanceof JevUnavailableError) {
    const status = error.upstreamStatus
    if (status === 401 || status === 403) {
      return new JevError('Jev rejected the configured API key', 'JEV_AUTH_FAILED', status)
    }
    if (status === 402) return new JevError('Jev quota exceeded', 'JEV_QUOTA_EXCEEDED', status)
    if (status === 429) return new JevError('Jev rate limited, try again shortly', 'JEV_RATE_LIMITED', status)
    if (status !== undefined) return new JevError(`Jev API error: ${status}`, 'JEV_API_ERROR', status)
    return new JevError('Invalid response from Jev', 'JEV_INVALID_RESPONSE')
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new JevError('Jev did not respond in time', 'JEV_TIMEOUT')
  }
  return new JevError('Jev request failed', 'JEV_API_ERROR')
}

/**
 * Ask Jev which option is best. Returns the winner with its probability
 * distribution and confidence. Only an id from `request.options` can win.
 */
export async function jevChoose(
  apiKey: string,
  request: JevJudgeRequest,
  signal?: AbortSignal,
): Promise<JevChoiceResult> {
  let answer
  try {
    answer = await requestJevChoice({
      apiKey,
      model: JEV_JUDGE_MODEL,
      state: buildState(request),
      questionName: 'best_response',
      instructions: request.question,
      criteria: Object.fromEntries(request.options.map((option) => [option.id, option.label])),
      timeoutMs: JEV_JUDGE_TIMEOUT_MS,
      signal,
    })
  } catch (error) {
    throw toJevError(error)
  }

  const winner = request.options.find((option) => option.id === answer.choice)
  if (!winner) {
    throw new JevError('Jev returned unknown option', 'JEV_INVALID_RESPONSE')
  }

  return {
    winnerId: winner.id,
    winnerLabel: winner.label,
    probabilities: answer.probabilities,
    confidence: answer.confidence,
    model: answer.model,
  }
}

function buildState(request: JevJudgeRequest): string {
  const parts = [`Context: ${request.state}`, '', 'Responses to judge:']
  for (const option of request.options) {
    const content = request.contents[option.id] ?? ''
    // Truncate long responses to keep token usage reasonable
    const truncated =
      content.length > MAX_RESPONSE_CHARS_PER_OPTION
        ? content.slice(0, MAX_RESPONSE_CHARS_PER_OPTION) + '...[truncated]'
        : content
    parts.push(`--- ${option.label} ---`, truncated, '')
  }
  return parts.join('\n')
}

/**
 * Resolve the Jev key for judging. The user's own stored key wins, so a user
 * who configured and enabled Jev is billed on their own account. A server-wide
 * JEV_API_KEY is only a fallback for users without a stored key.
 */
export function getJevApiKey(userKey?: string | null): string | null {
  if (userKey?.trim()) {
    return userKey.trim()
  }
  if (process.env.JEV_API_KEY?.trim()) {
    return process.env.JEV_API_KEY.trim()
  }
  return null
}
