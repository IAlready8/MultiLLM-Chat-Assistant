/**
 * OpenAI Service
 * 
 * Enhanced OpenAI service with configuration management and error handling.
 */

import { configManager } from '@/lib/config-manager'
import { 
  errorManager, 
  LLMProviderError, 
  NetworkError, 
  ValidationError,
  createErrorContext 
} from '@/lib/error-system'
import type { ProviderConfig } from '@/lib/config-schemas'

interface OpenAIRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  model?: string
  temperature?: number
  max_tokens?: number
  stream?: boolean
  userId?: string
}

interface OpenAIResponse {
  content: string
  finish_reason: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface OpenAIStreamChunk {
  choices: Array<{
    delta: { content?: string; role?: string }
    finish_reason: string | null
  }>
}

export class OpenAIService {
  private static instance: OpenAIService
  private baseUrl = 'https://api.openai.com/v1'

  private constructor() {}

  public static getInstance(): OpenAIService {
    if (!OpenAIService.instance) {
      OpenAIService.instance = new OpenAIService()
    }
    return OpenAIService.instance
  }

  async getConfig(userId: string): Promise<ProviderConfig> {
    try {
      const config = await configManager.getProviderConfig(userId, 'openai')
      if (!config) {
        const context = createErrorContext('/services/openai', userId)
        throw new ValidationError('OpenAI configuration not found', 'provider_config', context)
      }
      return config
    } catch (error) {
      const context = createErrorContext('/services/openai', userId, { action: 'get_config' })
      await errorManager.logError(error as Error, context)
      throw error
    }
  }

  async testConnection(apiKey: string, baseUrl?: string): Promise<boolean> {
    try {
      const url = baseUrl || this.baseUrl
      const response = await fetch(`${url}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'Personal-LLM-Tool/1.0',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        const context = createErrorContext('/services/openai/test', undefined, { 
          status: response.status,
          statusText: response.statusText 
        })
        throw new LLMProviderError(
          'openai', 
          errorBody.error?.message || `HTTP ${response.status}: ${response.statusText}`, 
          context
        )
      }

      return true
    } catch (error) {
      if (error instanceof LLMProviderError) {
        throw error
      }
      
      const context = createErrorContext('/services/openai/test')
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new NetworkError('Failed to connect to OpenAI API', context, error)
      }
      
      throw new LLMProviderError('openai', (error as Error).message, context)
    }
  }

  async chat(request: OpenAIRequest): Promise<OpenAIResponse> {
    const context = createErrorContext('/services/openai/chat', request.userId, {
      model: request.model,
      messages_count: request.messages.length,
    })

    try {
      if (!request.userId) {
        throw new ValidationError('User ID is required for chat', 'userId', context)
      }
      if (!request.messages || request.messages.length === 0) {
        throw new ValidationError('Messages array is required and cannot be empty', 'messages', context)
      }

      const response = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'openai',
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          stream: false, // Explicitly request a non-streaming response
        }),
        signal: AbortSignal.timeout(60000), // 60 second timeout
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        const errorMessage = errorBody.error || `HTTP ${response.status}: ${response.statusText}`
        throw new LLMProviderError('openai-proxy', errorMessage, context)
      }

      const data = await response.json()
      return data as OpenAIResponse

    } catch (error) {
      await errorManager.logError(error as Error, context)
      throw error
    }
  }

  async *streamChat(request: OpenAIRequest): AsyncGenerator<string, void, undefined> {
    const context = createErrorContext('/services/openai/stream', request.userId, {
      model: request.model,
      messages_count: request.messages.length,
    })

    try {
      if (!request.userId) {
        throw new ValidationError('User ID is required for streaming chat', 'userId', context)
      }
      if (!request.messages || request.messages.length === 0) {
        throw new ValidationError('Messages array is required and cannot be empty', 'messages', context)
      }

      const response = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'openai',
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.max_tokens,
        }),
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        const errorMessage = errorBody.error || `HTTP ${response.status}: ${response.statusText}`
        throw new LLMProviderError('openai-proxy', errorMessage, context)
      }

      if (!response.body) {
        throw new LLMProviderError('openai-proxy', 'No response body received from backend', context)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          yield chunk
        }
      } finally {
        reader.releaseLock()
      }

    } catch (error) {
      await errorManager.logError(error as Error, context)
      throw error
    }
  }

  async getModels(userId?: string): Promise<string[]> {
    const context = createErrorContext('/services/openai/models', userId)

    try {
      if (userId) {
        const config = await this.getConfig(userId)
        return config.models
      }
      
      // Return default models
      return configManager.getDefaultModels('openai')
    } catch (error) {
      await errorManager.logError(error as Error, context)
      throw error
    }
  }
}

// Legacy function for backward compatibility
export async function callOpenAI(request: {
  apiKey: string;
  model: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
}): Promise<{ text: string; finish_reason: string }> {
  const service = OpenAIService.getInstance()
  
  const messages = [{ role: 'user' as const, content: request.prompt }]
  
  const response = await service.chat({
    messages,
    model: request.model,
    temperature: request.temperature,
    max_tokens: request.max_tokens,
  })

  return {
    text: response.content,
    finish_reason: response.finish_reason,
  }
}