type HistoryMessage = {
  id?: string
  clientId?: string
  role: 'system' | 'user' | 'assistant'
  content: string
  provider?: string
  model?: string
  instanceId?: string
  turnId?: string
  generationStatus?: string
}

export type ModelHistoryMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/** Messages sent to one model, grouped by the user turn that starts each group. */
export type ModelHistoryTurn = { key: string; messages: ModelHistoryMessage[] }

export const PREAMBLE_TURN_KEY = '__preamble__'

export function buildModelHistoryTurns(messages: HistoryMessage[], instance: { id: string; provider: string; model: string }): ModelHistoryTurn[] {
  const hasInstanceHistory = messages.some(message => message.instanceId === instance.id)
  const instanceTurns = new Set(messages.filter(message => message.instanceId === instance.id && message.turnId).map(message => message.turnId))
  const compatible = messages.filter(message => {
    if (!message.content.trim()) return false
    if (message.role !== 'assistant') return true
    if (message.generationStatus && message.generationStatus !== 'complete') return false
    if (message.provider !== instance.provider || message.model !== instance.model) return false
    // After reload or adding an instance, retain earlier model history for turns
    // this instance did not participate in. A failed own response must not be
    // replaced by another instance's answer for the same turn.
    const hasOwnTurn = message.turnId ? instanceTurns.has(message.turnId) : hasInstanceHistory
    return !hasOwnTurn || !message.instanceId || message.instanceId === instance.id
  })
  // A regeneration is an alternative for a turn, not another consecutive answer.
  const latest = new Map<string, HistoryMessage>()
  for (const message of compatible) {
    if (message.role === 'assistant' && message.turnId) latest.set(message.turnId, message)
  }
  const userTurns = new Set(compatible.filter(message => message.role === 'user').map(message => message.id || message.clientId).filter(Boolean))
  const turns: ModelHistoryTurn[] = []
  let current: ModelHistoryTurn | undefined
  compatible.forEach((message, index) => {
    if (message.role === 'assistant' && message.turnId) {
      if (userTurns.has(message.turnId) || latest.get(message.turnId) !== message) return
    }
    const turn = message.role === 'user' ? message.id || message.clientId : undefined
    if (message.role === 'user') {
      current = { key: turn || `turn-${index}`, messages: [] }
      turns.push(current)
    } else if (!current) {
      current = { key: PREAMBLE_TURN_KEY, messages: [] }
      turns.push(current)
    }
    current.messages.push({ role: message.role, content: message.content })
    const answer = turn ? latest.get(turn) : undefined
    if (answer) current.messages.push({ role: answer.role, content: answer.content })
  })
  return turns
}

export function buildModelHistory(messages: HistoryMessage[], instance: { id: string; provider: string; model: string }): ModelHistoryMessage[] {
  return buildModelHistoryTurns(messages, instance).flatMap(turn => turn.messages)
}
