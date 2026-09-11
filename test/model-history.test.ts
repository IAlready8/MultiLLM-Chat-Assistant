import { describe, expect, it } from 'vitest'
import { buildModelHistory } from '@/lib/model-history'
import { orderConversationMessages } from '@/services/generation-service'
import type { Message } from '@/types/prisma'

describe('model attribution and ordering', () => {
  const instance = { id: 'model-a', provider: 'openai', model: 'test-model' }
  it('keeps only this model’s latest completed answer per turn', () => {
    const messages = [
      { role: 'user' as const, content: 'prompt' },
      { role: 'assistant' as const, content: 'old', provider: 'openai', model: 'test-model', instanceId: 'model-a', turnId: 'turn' },
      { role: 'assistant' as const, content: 'other model', provider: 'anthropic', model: 'test-model' },
      { role: 'assistant' as const, content: 'partial', provider: 'openai', model: 'test-model', generationStatus: 'failed' },
      { role: 'assistant' as const, content: 'revised', provider: 'openai', model: 'test-model', instanceId: 'model-a', turnId: 'turn' },
      { role: 'user' as const, content: 'follow up' },
    ]
    expect(buildModelHistory(messages, instance).map(message => message.content)).toEqual(['prompt', 'revised', 'follow up'])
  })
  it('restores model-specific history when instance IDs change after reload', () => {
    expect(buildModelHistory([{ role: 'assistant', content: 'saved', provider: 'openai', model: 'test-model', instanceId: 'previous' }], instance)).toEqual([{ role: 'assistant', content: 'saved' }])
  })
  it('places a regenerated older answer with its original user turn before subsequent context', () => {
    const assistant = { role: 'assistant' as const, provider: 'openai', model: 'test-model', instanceId: 'model-a' }
    const history = buildModelHistory([
      { id: 'turn-1', role: 'user', content: 'First question' },
      { ...assistant, turnId: 'turn-1', content: 'Original answer' },
      { id: 'turn-2', role: 'user', content: 'Second question' },
      { ...assistant, turnId: 'turn-2', content: 'Second answer' },
      { ...assistant, turnId: 'turn-1', content: 'Regenerated first answer' },
      { id: 'turn-3', role: 'user', content: 'Follow up' },
    ], instance)
    expect(history.map(message => message.content)).toEqual(['First question', 'Regenerated first answer', 'Second question', 'Second answer', 'Follow up'])
  })

  it('retains history from before reload while excluding another instance on an owned failed turn', () => {
    const assistant = { role: 'assistant' as const, provider: 'openai', model: 'test-model' }
    const history = buildModelHistory([
      { id: 'turn-1', role: 'user', content: 'Before reload' },
      { ...assistant, turnId: 'turn-1', instanceId: 'old-instance', content: 'Historical answer' },
      { id: 'turn-2', role: 'user', content: 'After reload' },
      { ...assistant, turnId: 'turn-2', instanceId: 'model-a', content: 'Current answer' },
      { id: 'turn-3', role: 'user', content: 'Next question' },
      { ...assistant, turnId: 'turn-3', instanceId: 'model-a', content: 'Incomplete', generationStatus: 'failed' },
      { ...assistant, turnId: 'turn-3', instanceId: 'different-instance', content: 'Other instance answer' },
    ], instance)
    expect(history.map(message => message.content)).toEqual(['Before reload', 'Historical answer', 'After reload', 'Current answer', 'Next question'])
  })

  it('orders durable responses by the user turn and selected model position', () => {
    const base = { conversationId: 'conversation', createdAt: new Date() }
    const messages: Message[] = [
      { ...base, id: 'user', clientId: 'turn', role: 'user', content: 'prompt' },
      { ...base, id: 'b', role: 'assistant', content: 'fast', turnId: 'turn', position: 1 },
      { ...base, id: 'user-2', role: 'user', content: 'next' },
      { ...base, id: 'a', role: 'assistant', content: 'slow', turnId: 'turn', position: 0 },
    ]
    expect(orderConversationMessages(messages).map(message => message.id)).toEqual(['user', 'a', 'b', 'user-2'])
  })
})
