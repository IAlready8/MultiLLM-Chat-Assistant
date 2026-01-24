import { errorManager, LLMProviderError, createErrorContext, ValidationError } from '@/lib/error-system'
import { OpenAIService } from './llm-providers/openai-service'
import { AnthropicService } from './llm-providers/anthropic-service'
import { GoogleAIService } from './llm-providers/google-service'

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

// Provider service registry
const providerServices = {
  openai: () => OpenAIService.getInstance(),
  anthropic: () => AnthropicService.getInstance(),
  googleai: () => GoogleAIService.getInstance(),
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
    // Validate provider
    if (!provider || typeof provider !== 'string') {
      throw new ValidationError('Provider is required and must be a string', 'provider', context)
    }

    if (!(provider in providerServices)) {
      throw new ValidationError(`Unsupported provider: ${provider}`, 'provider', context)
    }

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new ValidationError('Messages array is required and cannot be empty', 'messages', context)
    }

    // Get provider service
    const service = providerServices[provider as keyof typeof providerServices]()

    // Convert to provider format (cast to allow 'system' role)
    const providerMessages = messages.map(msg => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }))

    const response = await service.chat({
      messages: providerMessages,
      model: options.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      userId: options.userId,
    })
    
    return {
      role: "assistant",
      content: response.content,
      timestamp: Date.now(),
      metadata: {
        provider,
        model: options.model,
        finish_reason: response.finish_reason,
        usage: (response as any).usage ?? null,
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
    // Validate provider
    if (!provider || typeof provider !== 'string') {
      throw new ValidationError('Provider is required and must be a string', 'provider', context)
    }

    if (!(provider in providerServices)) {
      throw new ValidationError(`Unsupported provider: ${provider}`, 'provider', context)
    }

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new ValidationError('Messages array is required and cannot be empty', 'messages', context)
    }

    // Validate onChunk callback
    if (typeof onChunk !== 'function') {
      throw new ValidationError('onChunk must be a function', 'onChunk', context)
    }

    // Get provider service
    const service = providerServices[provider as keyof typeof providerServices]()

    // Convert to provider format
    const providerMessages = messages.map(msg => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }))

    // Check for abort signal
    if (options.abortSignal?.aborted) {
      throw new LLMProviderError(provider, 'Request was aborted', context)
    }

    // Stream response
    const stream = service.streamChat({
      messages: providerMessages,
      model: options.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      userId: options.userId,
    })

    for await (const chunk of stream) {
      // Check for abort signal during streaming
      if (options.abortSignal?.aborted) {
        throw new LLMProviderError(provider, 'Request was aborted during streaming', context)
      }
      
      onChunk(chunk)
    }

  } catch (error) {
    await errorManager.logError(error as Error, context)
    
    // Send error chunk for streaming responses
    try {
      if (error instanceof Error) {
        onChunk(`Error: ${error.message}`)
      } else {
        onChunk('Error: An unexpected error occurred')
      }
    } catch (chunkError) {
      // If even the error chunk fails, just log it
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