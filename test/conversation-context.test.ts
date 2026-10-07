import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/types/prisma'

type Row = Record<string, unknown>
const store = vi.hoisted(() => ({
  conversations: [] as Array<Record<string, unknown>>,
  messages: [] as Array<Record<string, unknown>>,
  window: 1_000_000,
  queries: 0,
}))

function compare(left: unknown, right: unknown) {
  const a = left instanceof Date ? left.getTime() : left
  const b = right instanceof Date ? right.getTime() : right
  if (a === b) return 0
  return (a as number | string) < (b as number | string) ? -1 : 1
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Row[]).some(item => matches(row, item))
    if (key === 'AND') return (condition as Row[]).every(item => matches(row, item))
    const value = row[key] ?? null
    if (condition === null) return value === null
    if (condition instanceof Date || typeof condition !== 'object') return compare(value, condition) === 0
    return Object.entries(condition as Row).every(([operator, operand]) => {
      switch (operator) {
        case 'lt': return value !== null && compare(value, operand) < 0
        case 'lte': return value !== null && compare(value, operand) <= 0
        case 'gt': return value !== null && compare(value, operand) > 0
        case 'gte': return value !== null && compare(value, operand) >= 0
        case 'not': return compare(value, operand) !== 0
        case 'in': return (operand as unknown[]).includes(value)
        default: throw new Error(`Unsupported operator ${operator}`)
      }
    })
  })
}

function findMany(rows: Row[], args: { where?: Row; orderBy?: Array<Record<string, 'asc' | 'desc'>>; take?: number } = {}) {
  store.queries++
  let result = rows.filter(row => matches(row, args.where))
  if (args.orderBy) {
    result = [...result].sort((a, b) => {
      for (const order of args.orderBy!) {
        const [field, direction] = Object.entries(order)[0]
        const value = compare(a[field], b[field])
        if (value) return direction === 'desc' ? -value : value
      }
      return 0
    })
  }
  return result.slice(0, args.take ?? result.length).map(row => ({ ...row }))
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: { findFirst: async (args: { where: Row }) => findMany(store.conversations, args)[0] ?? null },
    message: {
      findMany: async (args: { where: Row; orderBy?: Array<Record<string, 'asc' | 'desc'>>; take?: number }) => findMany(store.messages, args),
      findFirst: async (args: { where: Row }) => findMany(store.messages, args)[0] ?? null,
      count: async (args: { where: Row }) => findMany(store.messages, args).length,
    },
  },
}))
vi.mock('@/lib/token-counter', () => ({ getContextWindowLimit: () => store.window }))
vi.mock('@/services/generation-service', async original => ({
  ...await original<typeof import('@/services/generation-service')>(),
  reconcileExpiredGenerations: vi.fn().mockResolvedValue({ recovered: 0, batchFull: false }),
}))

import { assembleServerHistory, getConversationMessagePage, parseMessagePage, encodeMessageCursor } from '@/services/conversation-context'
import { buildModelHistory } from '@/lib/model-history'
import { orderConversationMessages } from '@/services/generation-service'
import type { ServerHistoryInput } from '@/lib/llm-request'

const start = Date.UTC(2026, 8, 1)
const turnId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
let sequence = 0
function add(message: Partial<Message> & Pick<Message, 'role' | 'content'>, at: number) {
  const row = { id: `m${String(sequence++).padStart(6, '0')}`, conversationId: 'conversation', createdAt: new Date(start + at), clientId: null, turnId: null, instanceId: null, provider: null, model: null, position: null, generationStatus: 'complete', ...message }
  store.messages.push(row)
  return row
}
const answer = { role: 'assistant' as const, provider: 'openai', model: 'gpt-test', instanceId: 'model-a' }
function addTurn(index: number, options: { other?: boolean; legacy?: boolean; failed?: boolean; size?: number } = {}) {
  const at = index * 10_000
  const content = options.size ? `Q${index} ${'x'.repeat(options.size)}` : `Question ${index}`
  add({ role: 'user', content, clientId: turnId(index) }, at)
  if (options.legacy) {
    add({ role: 'assistant', content: `Legacy answer ${index}`, provider: 'openai', model: 'gpt-test' }, at + 5)
    return
  }
  add({ ...answer, content: options.size ? `A${index} ${'y'.repeat(options.size)}` : `Answer ${index}`, turnId: turnId(index), position: 0, generationStatus: options.failed ? 'failed' : 'complete' }, at + 10)
  if (options.other) add({ role: 'assistant', content: `Other model ${index}`, provider: 'anthropic', model: 'claude-test', instanceId: 'model-b', turnId: turnId(index), position: 1 }, at + 20)
}
const input = (target: number, extra: Partial<ServerHistoryInput> = {}): ServerHistoryInput => ({
  provider: 'openai', model: 'gpt-test', history: 'server', conversationId: 'conversation',
  requestId: '10000000-0000-4000-8000-000000000001', turnId: turnId(target), instanceId: 'model-a', ...extra,
})
// The previous browser algorithm, applied to the fully loaded conversation, is the reference.
function legacyClientHistory(target: number) {
  const ordered = orderConversationMessages([...store.messages].sort((a, b) => compare(a.createdAt, b.createdAt) || compare(a.id, b.id)) as unknown as Message[])
  const index = ordered.findIndex(message => message.clientId === turnId(target))
  return buildModelHistory(ordered.slice(0, index + 1).map(message => ({
    id: message.clientId || message.id, role: message.role, content: message.content, provider: message.provider ?? undefined,
    model: message.model ?? undefined, instanceId: message.instanceId ?? undefined, turnId: message.turnId ?? undefined, generationStatus: message.generationStatus,
  })), { id: 'model-a', provider: 'openai', model: 'gpt-test' })
}

describe('server-authoritative conversation context', () => {
  beforeEach(() => {
    store.conversations = [{ id: 'conversation', userId: 'owner', title: 'Long conversation', createdAt: new Date(start), updatedAt: new Date(start) }]
    store.messages = []
    store.window = 1_000_000
    store.queries = 0
    sequence = 0
  })

  it('matches the complete browser history for a long conversation spanning several load batches', async () => {
    add({ role: 'system', content: 'Imported preamble' }, -1)
    for (let index = 1; index <= 60; index++) addTurn(index, { other: index % 2 === 0, legacy: index === 7, failed: index === 11 })
    const context = await assembleServerHistory('owner', input(60))
    expect(context.messages).toEqual(legacyClientHistory(60))
    expect(context.messages.at(-1)).toEqual({ role: 'user', content: 'Question 60' })
    expect(context).toMatchObject({ includedTurns: 60, omittedTurns: 0, truncated: false })
  })

  it('regenerates an older turn with only its preceding context and a later regeneration of an earlier turn', async () => {
    for (let index = 1; index <= 5; index++) addTurn(index)
    add({ ...answer, content: 'Regenerated answer 2', turnId: turnId(2), position: 0 }, 60_000)
    const context = await assembleServerHistory('owner', input(4))
    expect(context.messages).toEqual(legacyClientHistory(4))
    expect(context.messages.map(message => message.content)).toEqual(['Question 1', 'Answer 1', 'Question 2', 'Regenerated answer 2', 'Question 3', 'Answer 3', 'Question 4'])
  })

  it('drops whole oldest turns to fit the model budget and reports unloaded omissions', async () => {
    for (let index = 1; index <= 80; index++) addTurn(index, { size: 400 })
    // A completed turn costs about 844 bytes; the target turn is its user
    // message alone. Reserving 4,096 output leaves room for ten full turns
    // plus the target.
    store.window = 4_096 + 10 * 900
    const context = await assembleServerHistory('owner', input(80))
    expect(context.includedTurns).toBe(11)
    expect(context.omittedTurns).toBe(69)
    expect(context.includedTurns + context.omittedTurns).toBe(80)
    expect(context.truncated).toBe(true)
    expect(context.messages[0].content.startsWith('Q70 ')).toBe(true)
    expect(context.messages[1].content.startsWith('A70 ')).toBe(true)
    expect(context.messages.at(-1)!.content.startsWith('Q80 ')).toBe(true)
    expect(context.messages.filter(message => message.role === 'user')).toHaveLength(11)
  })

  it('keeps the provider message ceiling without splitting a turn', async () => {
    for (let index = 1; index <= 150; index++) addTurn(index)
    const context = await assembleServerHistory('owner', input(150))
    expect(context.messages.length).toBeLessThanOrEqual(200)
    expect(context.messages[0].role).toBe('user')
    expect(context.includedTurns + context.omittedTurns).toBe(150)
    expect(context.truncated).toBe(true)
  })

  it('always keeps the target turn so an oversized prompt fails the model contract instead of disappearing', async () => {
    addTurn(1)
    addTurn(2, { size: 10_000 })
    store.window = 4_096 + 100
    const context = await assembleServerHistory('owner', input(2))
    expect(context.messages).toHaveLength(1)
    expect(context.omittedTurns).toBe(1)
  })

  it('rejects another account and unsaved turns before loading history', async () => {
    addTurn(1)
    await expect(assembleServerHistory('intruder', input(1))).rejects.toMatchObject({ status: 404, code: 'CONVERSATION_NOT_FOUND' })
    await expect(assembleServerHistory('owner', input(9))).rejects.toMatchObject({ status: 409, code: 'TURN_NOT_FOUND' })
  })
})

describe('turn-aligned message pages', () => {
  beforeEach(() => {
    store.conversations = [{ id: 'conversation', userId: 'owner', title: 'Paged', createdAt: new Date(start), updatedAt: new Date(start) }]
    store.messages = []
    sequence = 0
  })

  it('partitions every message exactly once, newest turns first, without splitting turns', async () => {
    add({ role: 'system', content: 'Imported preamble' }, -1)
    for (let index = 1; index <= 45; index++) addTurn(index, { other: true, legacy: index === 3 })
    // Regenerating turn 5 after later turns keeps it attached to turn 5.
    add({ ...answer, content: 'Regenerated answer 5', turnId: turnId(5), position: 0 }, 500_000)
    const pages: Message[][] = []
    let cursor: string | null | undefined
    do {
      const page = await getConversationMessagePage('conversation', 'owner', { limit: 20, cursor: cursor ? parseMessagePage(new URLSearchParams({ messagesLimit: '20', before: cursor }))!.cursor : undefined })
      expect(page).not.toBeNull()
      pages.push(page!.messages)
      cursor = page!.nextMessageCursor
    } while (cursor)
    expect(pages.map(page => page.filter(message => message.role === 'user').length)).toEqual([20, 20, 5])
    const combined = [...pages].reverse().flat()
    expect(combined.map(message => message.id).sort()).toEqual(store.messages.map(message => message.id as string).sort())
    expect(new Set(combined.map(message => message.id)).size).toBe(combined.length)
    const full = orderConversationMessages([...store.messages].sort((a, b) => compare(a.createdAt, b.createdAt) || compare(a.id, b.id)) as unknown as Message[])
    expect(combined.map(message => message.id)).toEqual(full.map(message => message.id))
    const oldest = pages.at(-1)!
    expect(oldest[0].content).toBe('Imported preamble')
    const turnFive = oldest.findIndex(message => message.clientId === turnId(5))
    expect(oldest.slice(turnFive + 1, turnFive + 4).map(message => message.content)).toEqual(['Answer 5', 'Regenerated answer 5', 'Other model 5'])
  })

  it('returns null for another account and validates page parameters', async () => {
    addTurn(1)
    expect(await getConversationMessagePage('conversation', 'intruder', { limit: 20 })).toBeNull()
    expect(parseMessagePage(new URLSearchParams())).toBeNull()
    for (const messagesLimit of ['0', '51', '1.5', 'many']) {
      expect(() => parseMessagePage(new URLSearchParams({ messagesLimit }))).toThrow('Invalid message page size')
    }
    for (const before of ['not-base64-json', Buffer.from(JSON.stringify({ id: 'x', createdAt: 'yesterday' })).toString('base64url'), 'a'.repeat(600)]) {
      expect(() => parseMessagePage(new URLSearchParams({ messagesLimit: '20', before }))).toThrow('Invalid message cursor')
    }
    const cursor = encodeMessageCursor({ id: 'm1', createdAt: new Date(start) })
    expect(parseMessagePage(new URLSearchParams({ messagesLimit: '5', before: cursor }))).toEqual({ limit: 5, cursor: { id: 'm1', createdAt: new Date(start) } })
  })
})
