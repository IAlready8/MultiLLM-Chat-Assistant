import { LlmRequestError } from '@/lib/llm-request'
import { getContextWindowLimit } from '@/lib/token-counter'
import type { ProviderRequest } from '@/lib/providers/types'

export const isOpenAiReasoningModel = (model: string) => /^(o[134](?:-|$)|gpt-5\.6(?:-|$)|gpt-6-astra(?:-|$))/.test(model)
export const isModernClaude = (model: string) => /^claude-(?:fable|opus|sonnet|haiku)-[5-9](?:-|$)/.test(model)

export function validateModelRequest(provider: string, request: ProviderRequest) {
  const model = request.model ?? ''
  if (!request.messages.some(message => message.role !== 'system')) {
    throw new LlmRequestError('Include a user message', 400, 'USER_MESSAGE_REQUIRED')
  }
  const reasoning = request.reasoning_effort
  if (model.startsWith('gpt-6-astra') && reasoning === 'off') throw new LlmRequestError('GPT-6 Astra requires reasoning', 400, 'MODEL_PARAMETER_UNSUPPORTED')
  if (reasoning && reasoning !== 'off') {
    const supported = provider === 'deepseek' || (provider === 'openai' && isOpenAiReasoningModel(model))
    if (!supported || (/^o[134](?:-|$)/.test(model) && reasoning === 'max')) {
      throw new LlmRequestError('The selected model does not support this reasoning setting', 400, 'MODEL_CAPABILITY_UNSUPPORTED')
    }
  }
  if (provider === 'anthropic' && request.temperature !== undefined && (request.temperature > 1 || (isModernClaude(model) && request.temperature !== 1))) {
    throw new LlmRequestError('This Claude model does not support the selected temperature', 400, 'MODEL_PARAMETER_UNSUPPORTED')
  }
  // UTF-8 bytes form a deliberately conservative text budget. This is a
  // guardrail, not exact provider tokenization or invoice-grade usage.
  const inputBudget = request.messages.reduce((sum, message) => sum + new TextEncoder().encode(message.content).byteLength + 16, 0)
  const outputBudget = request.max_tokens ?? 4096
  if (inputBudget + outputBudget > getContextWindowLimit(provider, model)) {
    throw new LlmRequestError('Conversation exceeds the model context budget. Start a new conversation, shorten the prompt, or choose a larger-context model.', 400, 'CONTEXT_BUDGET_EXCEEDED')
  }
}
