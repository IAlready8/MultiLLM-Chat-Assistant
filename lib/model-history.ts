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

export function buildModelHistory(messages: HistoryMessage[], instance: { id: string; provider: string; model: string }) {
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
  return compatible.flatMap(message => {
    if (message.role === 'assistant' && message.turnId) {
      if (userTurns.has(message.turnId) || latest.get(message.turnId) !== message) return []
    }
    const turn = message.role === 'user' ? message.id || message.clientId : undefined
    const answer = turn ? latest.get(turn) : undefined
    return answer ? [message, answer] : [message]
  }).map(({ role, content }) => ({ role, content }))
}
