import { errorManager, LLMProviderError, createErrorContext, ValidationError } from '@/lib/error-system'
import { getUserApiKey, getUserProviderConfigs } from '@/lib/api-key-service'
import {
  getProviderAdapter,
} from '@/lib/providers'
import type { ProviderRequest, ProviderAdapterConfig } from '@/lib/providers'
import {
  getProviderDisabledMessage,
  isProviderApiKeyRequired,
  isProviderDisabled,
} from '@/lib/provider-registry'

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
  metadata?: Record<string, any>;
}

export interface StreamChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  userId?: string;
  abortSignal?: AbortSignal;
}

/**
 * Resolve a ProviderAdapterConfig from userId + provider.
 * Fetches API key and provider config, builds the adapter config.
 */
async function resolveAdapterConfig(
  userId: string,
  provider: string,
): Promise<ProviderAdapterConfig> {
  const [providerConfigs, apiKey] = await Promise.all([
    getUserProviderConfigs(userId),
    getUserApiKey(userId, provider),
  ])

  const providerConfig = providerConfigs.find((c: any) => c.provider === provider)
  if (!providerConfig || (!apiKey && isProviderApiKeyRequired(provider))) {
    throw new ValidationError(
      `Provider ${provider} not configured`,
      'provider',
      createErrorContext('/services/api-service', userId),
    )
  }

  const settings = providerConfig.settings || {}
  const defaultBaseUrl = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined
  const baseUrl = settings.baseUrl || defaultBaseUrl
  const extraHeaders: Record<string, string> = {}
  if (provider === 'openrouter') {
    if (settings.httpReferer) extraHeaders['HTTP-Referer'] = settings.httpReferer
    if (settings.xTitle) extraHeaders['X-Title'] = settings.xTitle
  }

  return { apiKey: apiKey ?? '', baseUrl, extraHeaders }
}

export async function sendChatMessage(
  provider: string,
  messages: ChatMessage[],
  options: StreamChatOptions = {}
): Promise<ChatMessage> {
  const context = createErrorContext('/services/api-service', options.userId, {
    provider,
    action: 'send_chat',
    messages_count: messages.length,
  })

  try {
    if (!provider || typeof provider !== 'string') {
      throw new ValidationError('Provider is required and must be a string', 'provider', context)
    }

    const normalizedProvider = provider.trim().toLowerCase()
    if (isProviderDisabled(normalizedProvider)) {
      throw new ValidationError(getProviderDisabledMessage(normalizedProvider), 'provider', context)
    }

    const adapter = getProviderAdapter(provider)
    if (!adapter) {
      throw new ValidationError(`Unsupported provider: ${provider}`, 'provider', context)
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new ValidationError('Messages array is required and cannot be empty', 'messages', context)
    }

    if (!options.userId) {
      throw new ValidationError('User ID is required for chat', 'userId', context)
    }

    const adapterConfig = await resolveAdapterConfig(options.userId, provider)
    const providerRequest: ProviderRequest = {
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      model: options.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      userId: options.userId,
    }

    const response = await adapter.chat(providerRequest, adapterConfig)

    return {
      role: "assistant",
      content: response.content,
      timestamp: Date.now(),
      metadata: {
        provider,
        model: options.model,
        finish_reason: response.finish_reason,
        usage: response.usage ?? null,
      }
    }

  } catch (error) {
    await errorManager.logError(error as Error, context)
    throw error
  }
}

export async function streamChatMessage(
  provider: string,
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  options: StreamChatOptions = {}
): Promise<void> {
  const context = createErrorContext('/services/api-service/stream', options.userId, {
    provider,
    action: 'stream_chat',
    messages_count: messages.length,
  })

  try {
    if (!provider || typeof provider !== 'string') {
      throw new ValidationError('Provider is required and must be a string', 'provider', context)
    }

    const normalizedProvider = provider.trim().toLowerCase()
    if (isProviderDisabled(normalizedProvider)) {
      throw new ValidationError(getProviderDisabledMessage(normalizedProvider), 'provider', context)
    }

    const adapter = getProviderAdapter(provider)
    if (!adapter) {
      throw new ValidationError(`Unsupported provider: ${provider}`, 'provider', context)
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new ValidationError('Messages array is required and cannot be empty', 'messages', context)
    }

    if (typeof onChunk !== 'function') {
      throw new ValidationError('onChunk must be a function', 'onChunk', context)
    }

    if (!options.userId) {
      throw new ValidationError('User ID is required for streaming chat', 'userId', context)
    }

    if (options.abortSignal?.aborted) {
      throw new LLMProviderError(provider, 'Request was aborted', context)
    }

    const adapterConfig = await resolveAdapterConfig(options.userId, provider)
    const providerRequest: ProviderRequest = {
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      model: options.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      userId: options.userId,
    }

    const stream = adapter.stream(providerRequest, adapterConfig)

    for await (const chunk of stream) {
      if (options.abortSignal?.aborted) {
        throw new LLMProviderError(provider, 'Request was aborted during streaming', context)
      }
      onChunk(chunk)
    }

  } catch (error) {
    await errorManager.logError(error as Error, context)

    try {
      if (error instanceof Error) {
        onChunk(`Error: ${error.message}`)
      } else {
        onChunk('Error: An unexpected error occurred')
      }
    } catch (chunkError) {
      console.error('Failed to send error chunk:', chunkError)
    }

    throw error
  }
}

// Legacy compatibility function
export async function callLLMApi(
  provider: string,
  prompt: string[],
  options: any = {}
): Promise<any> {
  const messages: ChatMessage[] = prompt.map((p, index) => ({
    role: index === 0 && options.systemPrompt ? 'system' : 'user',
    content: index === 0 && options.systemPrompt ? options.systemPrompt : p,
  }))

  if (options.stream && options.onChunk) {
    await streamChatMessage(provider, messages, options.onChunk, options)
    return { text: '', usage: {}, metadata: {} }
  } else {
    const response = await sendChatMessage(provider, messages, options)
    return {
      text: response.content,
      usage: response.metadata?.usage || {},
      metadata: response.metadata || {},
    }
  }
}
