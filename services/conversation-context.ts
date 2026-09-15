import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { LlmRequestError, type ServerHistoryInput } from '@/lib/llm-request'
import { buildModelHistoryTurns, PREAMBLE_TURN_KEY, type ModelHistoryMessage } from '@/lib/model-history'
import { contextInputLimit, messageContextCost } from '@/lib/model-contract'
import { orderConversationMessages, reconcileExpiredGenerations } from '@/services/generation-service'
import type { Conversation, Message } from '@/types/prisma'

/** Matches the client request contract so server and browser history obey one ceiling. */
export const MAX_HISTORY_MESSAGES = 200
export const DEFAULT_MESSAGE_PAGE_TURNS = 20
export const MAX_MESSAGE_PAGE_TURNS = 50
/** Every retained turn contributes at least its user message, so scanning more turns cannot fit. */
const MAX_CONTEXT_TURNS_SCANNED = MAX_HISTORY_MESSAGES
const CONTEXT_TURN_BATCH = 25
const MAX_WINDOW_MESSAGES = 2_000

type Boundary = { createdAt: Date; id: string }
type TurnWindow = { users: Message[]; messages: Message[]; hasOlder: boolean; oldest?: Boundary }

const beforeBoundary = (boundary: Boundary, inclusive: boolean) => ({
  OR: [
    { createdAt: { lt: boundary.createdAt } },
    { createdAt: boundary.createdAt, id: inclusive ? { lte: boundary.id } : { lt: boundary.id } },
  ],
})

const atOrAfterBoundary = (boundary: Boundary) => ({
  OR: [
    { createdAt: { gt: boundary.createdAt } },
    { createdAt: boundary.createdAt, id: { gte: boundary.id } },
  ],
})

const chronological = (a: Message, b: Message) =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

function ensureWindowSize(count: number) {
  if (count > MAX_WINDOW_MESSAGES) {
    throw new LlmRequestError('This part of the conversation is too large to load at once', 413, 'HISTORY_PAGE_TOO_LARGE')
  }
}

/**
 * Loads a window of complete user turns, newest first, below an optional boundary.
 *
 * A turn is its user message, every response linked by turnId (including later
 * regenerations) and unlinked legacy messages saved between that user message
 * and the next newer boundary. Windows partition a conversation without overlap.
 */
async function loadTurnWindow(
  conversationId: string,
  options: { upper?: Boundary; includeUpperUser?: boolean; limit: number; excludeTurnId?: string },
): Promise<TurnWindow> {
  const users = (await prisma.message.findMany({
    where: {
      conversationId,
      role: 'user',
      ...(options.upper ? beforeBoundary(options.upper, Boolean(options.includeUpperUser)) : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.limit + 1,
  })) as Message[]
  const hasOlder = users.length > options.limit
  const page = users.slice(0, options.limit).reverse()
  const oldestUser = page[0]
  const oldest = hasOlder && oldestUser ? { createdAt: new Date(oldestUser.createdAt), id: oldestUser.id } : undefined
  const turnIds = page
    .map(message => message.clientId)
    .filter((value): value is string => Boolean(value) && value !== options.excludeTurnId)

  const range = [
    ...(oldest ? [atOrAfterBoundary(oldest)] : []),
    ...(options.upper ? [beforeBoundary(options.upper, false)] : []),
  ]
  const [responses, loose] = await Promise.all([
    turnIds.length
      ? prisma.message.findMany({
          where: { conversationId, role: { not: 'user' }, turnId: { in: turnIds } },
          take: MAX_WINDOW_MESSAGES + 1,
        })
      : Promise.resolve([]),
    prisma.message.findMany({
      where: { conversationId, role: { not: 'user' }, turnId: null, ...(range.length ? { AND: range } : {}) },
      take: MAX_WINDOW_MESSAGES + 1,
    }),
  ])
  const byId = new Map<string, Message>()
  for (const message of [...page, ...(responses as Message[]), ...(loose as Message[])]) byId.set(message.id, message)
  ensureWindowSize(byId.size)
  return { users: page, messages: [...byId.values()], hasOlder, oldest }
}

const messageCursorSchema = z.object({ id: z.string().min(1).max(128), createdAt: z.string().datetime() }).strict()

export function encodeMessageCursor(boundary: Boundary) {
  return Buffer.from(JSON.stringify({ id: boundary.id, createdAt: new Date(boundary.createdAt).toISOString() })).toString('base64url')
}

export function parseMessagePage(params: URLSearchParams): { limit: number; cursor?: Boundary } | null {
  const rawLimit = params.get('messagesLimit')
  if (rawLimit === null) return null
  const limit = Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MESSAGE_PAGE_TURNS) {
    throw new LlmRequestError('Invalid message page size')
  }
  const raw = params.get('before')
  if (!raw) return { limit }
  try {
    if (raw.length > 512) throw new Error('Cursor too long')
    const parsed = messageCursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')))
    return { limit, cursor: { id: parsed.id, createdAt: new Date(parsed.createdAt) } }
  } catch {
    throw new LlmRequestError('Invalid message cursor')
  }
}

export type ConversationMessagePage = Conversation & {
  messages: Message[]
  nextMessageCursor: string | null
  pageTurns: number
}

/** Owned, bounded, turn-aligned history page. Older pages use the returned cursor. */
export async function getConversationMessagePage(
  conversationId: string,
  userId: string,
  page: { limit: number; cursor?: Boundary },
): Promise<ConversationMessagePage | null> {
  const conversation = (await prisma.conversation.findFirst({ where: { id: conversationId, userId } })) as Conversation | null
  if (!conversation) return null
  // Surface expired work as interrupted before the page is rendered.
  if (!page.cursor) await reconcileExpiredGenerations(userId, conversationId)
  const window = await loadTurnWindow(conversationId, { upper: page.cursor, limit: page.limit })
  return {
    ...conversation,
    messages: orderConversationMessages(window.messages.sort(chronological)),
    nextMessageCursor: window.oldest ? encodeMessageCursor(window.oldest) : null,
    pageTurns: window.users.length,
  }
}

export type AssembledHistory = {
  messages: ModelHistoryMessage[]
  includedTurns: number
  omittedTurns: number
  truncated: boolean
}

/**
 * Rebuilds one model's context for a saved generation from persisted history.
 *
 * Context ends at the target user turn: responses to that turn and all later
 * turns are excluded so regenerating an older answer sees what the original
 * request saw. When the model budget is exceeded, whole oldest turns are
 * dropped and reported; a turn is never split between user and answer.
 */
export async function assembleServerHistory(userId: string, input: ServerHistoryInput): Promise<AssembledHistory> {
  const conversation = await prisma.conversation.findFirst({ where: { id: input.conversationId, userId }, select: { id: true } })
  if (!conversation) throw new LlmRequestError('Conversation not found', 404, 'CONVERSATION_NOT_FOUND')
  const target = (await prisma.message.findFirst({
    where: { conversationId: input.conversationId, clientId: input.turnId, role: 'user' },
  })) as Message | null
  if (!target) throw new LlmRequestError('Save the user message before starting a generation', 409, 'TURN_NOT_FOUND')

  const budget = contextInputLimit(input.provider, input.model, input.max_tokens)
  const instance = { id: input.instanceId ?? `server:${input.requestId}`, provider: input.provider, model: input.model }
  const loaded = new Map<string, Message>()
  let upper: Boundary = { createdAt: new Date(target.createdAt), id: target.id }
  let first = true
  let scannedTurns = 0
  let hasOlder = false
  let oldest: Boundary | undefined

  const fit = () => {
    const ordered = orderConversationMessages([...loaded.values()].sort(chronological))
    const turns = buildModelHistoryTurns(ordered.map(message => ({
      id: message.clientId || message.id,
      clientId: message.clientId ?? undefined,
      role: message.role,
      content: message.content,
      provider: message.provider ?? undefined,
      model: message.model ?? undefined,
      instanceId: message.instanceId ?? undefined,
      turnId: message.turnId ?? undefined,
      generationStatus: message.generationStatus,
    })), instance)
    let cost = 0
    let count = 0
    let start = turns.length
    for (let index = turns.length - 1; index >= 0; index--) {
      const turnCost = turns[index].messages.reduce((sum, message) => sum + messageContextCost(message.content), 0)
      const nextCount = count + turns[index].messages.length
      // The target turn is always kept; if it alone is too large, the model
      // contract rejects the request with an actionable budget error.
      if (index < turns.length - 1 && (cost + turnCost > budget || nextCount > MAX_HISTORY_MESSAGES)) break
      cost += turnCost
      count = nextCount
      start = index
    }
    return { turns, start }
  }

  let result = fit()
  while (true) {
    const window = await loadTurnWindow(input.conversationId, {
      upper,
      includeUpperUser: first,
      limit: CONTEXT_TURN_BATCH,
      excludeTurnId: first ? input.turnId : undefined,
    })
    for (const message of window.messages) loaded.set(message.id, message)
    ensureWindowSize(loaded.size)
    scannedTurns += window.users.length
    hasOlder = window.hasOlder
    oldest = window.oldest
    first = false
    result = fit()
    if (result.start > 0 || !hasOlder || !oldest || scannedTurns >= MAX_CONTEXT_TURNS_SCANNED) break
    upper = oldest
  }

  const kept = result.turns.slice(result.start)
  const droppedLoaded = result.turns.slice(0, result.start).filter(turn => turn.key !== PREAMBLE_TURN_KEY).length
  const droppedPreamble = result.turns.slice(0, result.start).some(turn => turn.key === PREAMBLE_TURN_KEY)
  const unloaded = hasOlder && oldest
    ? await prisma.message.count({ where: { conversationId: input.conversationId, role: 'user', ...beforeBoundary(oldest, false) } })
    : 0
  const omittedTurns = droppedLoaded + unloaded
  return {
    messages: kept.flatMap(turn => turn.messages),
    includedTurns: kept.filter(turn => turn.key !== PREAMBLE_TURN_KEY).length,
    omittedTurns,
    truncated: omittedTurns > 0 || droppedPreamble || (hasOlder && Boolean(oldest)),
  }
}
