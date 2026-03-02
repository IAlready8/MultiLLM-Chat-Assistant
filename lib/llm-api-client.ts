/**
 * LLM API Client - Unified interface for multiple LLM providers
 * 
 * 3-STEP PLAN:
 * 1. Create provider-specific adapters with consistent interface
 * 2. Implement request/response standardization
 * 3. Add performance optimization and caching
 */

import { 
  getStoredApiKey 
} from './secure-storage';

// Define common types for all providers
export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  systemPrompt?: string;
}

export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
}

export interface LLMStreamCallbacks {
  onChunk: (chunk: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
}

// Provider-specific implementation for OpenAI
async function callOpenAI(
  messages: LLMMessage[],
  apiKey: string,
  options: LLMRequestOptions = {}
): Promise<LLMResponse> {
  // Prepare OpenAI-specific format
  const openaiMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  // Add system prompt if provided
  if (options.systemPrompt && !messages.some(m => m.role === 'system')) {
    openaiMessages.unshift({
      role: 'system',
      content: options.systemPrompt,
    });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'gpt-4o',
      messages: openaiMessages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    text: data.choices?.[0]?.message?.content || '',
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

// Provider-specific implementation for Anthropic (Claude)
async function callClaude(
  messages: LLMMessage[],
  apiKey: string,
  options: LLMRequestOptions = {}
): Promise<LLMResponse> {
  // Prepare Claude-specific format
  const claudeMessages = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content,
  }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: options.model || 'claude-3-opus-20240229',
      messages: claudeMessages,
      system: options.systemPrompt,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `Claude API error: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    text: data.content?.[0]?.text || '',
    usage: {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

// Provider-specific implementation for Google AI (Gemini)
async function callGoogleAI(
  messages: LLMMessage[],
  apiKey: string,
  options: LLMRequestOptions = {}
): Promise<LLMResponse> {
  // Format messages for Gemini
  const contents = [];
  
  // Add system prompt as first user message if provided
  if (options.systemPrompt) {
    contents.push({
      role: 'user',
      parts: [{ text: options.systemPrompt }],
    });
    
    // Add system response placeholder to maintain conversation flow
    contents.push({
      role: 'model',
      parts: [{ text: 'I understand.' }],
    });
  }
  
  // Add the actual conversation
  for (const msg of messages) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  }

  const modelName = options.model || 'gemini-pro';
  const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 2048,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `Google AI API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Extract response text and usage information
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  // Google AI doesn't provide token usage directly, estimate based on characters
  const promptChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
  const responseChars = responseText.length;
  const estimatedPromptTokens = Math.ceil(promptChars / 4);
  const estimatedResponseTokens = Math.ceil(responseChars / 4);
  
  return {
    text: responseText,
    usage: {
      promptTokens: estimatedPromptTokens,
      completionTokens: estimatedResponseTokens,
      totalTokens: estimatedPromptTokens + estimatedResponseTokens,
    },
    metadata: {
      provider: 'google',
      model: modelName,
    },
  };
}

// Main function to call any LLM based on provider
export async function callLLM(
  provider: string,
  messages: LLMMessage[],
  options: LLMRequestOptions = {}
): Promise<LLMResponse> {
  try {
    // Get API key for the selected provider
    const apiKey = await getStoredApiKey(provider);
    if (!apiKey) {
      throw new Error(`No API key configured for ${provider}. Please add it in Settings.`);
    }

    // Call the appropriate provider
    switch (provider) {
      case 'openai':
        return await callOpenAI(messages, apiKey, options);
      case 'claude':
        return await callClaude(messages, apiKey, options);
      case 'google':
        return await callGoogleAI(messages, apiKey, options);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error: any) {
    console.error(`Error calling ${provider} API:`, error);
    throw error;
  }
}

// Function for streaming responses
export async function streamLLM(
  provider: string,
  messages: LLMMessage[],
  callbacks: LLMStreamCallbacks,
  options: LLMRequestOptions = {}
): Promise<void> {
  try {
    const apiKey = await getStoredApiKey(provider);
    if (!apiKey) {
      throw new Error(`No API key configured for ${provider}`);
    }

    // Set streaming option
    options.stream = true;
    
    // Implementation varies by provider
    switch (provider) {
      case 'openai':
        await streamOpenAI(messages, apiKey, callbacks, options);
        break;
      case 'claude':
        await streamClaude(messages, apiKey, callbacks, options);
        break;
      default:
        // Fallback to non-streaming for unsupported providers
        const response = await callLLM(provider, messages, { ...options, stream: false });
        callbacks.onChunk(response.text);
        callbacks.onComplete?.(response.text);
    }
  } catch (error: any) {
    console.error(`Error streaming from ${provider}:`, error);
    callbacks.onError?.(error);
    throw error;
  }
}

// OpenAI streaming implementation
async function streamOpenAI(
  messages: LLMMessage[],
  apiKey: string,
  callbacks: LLMStreamCallbacks,
  options: LLMRequestOptions
): Promise<void> {
  // Implement OpenAI streaming
  const openaiMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  if (options.systemPrompt && !messages.some(m => m.role === 'system')) {
    openaiMessages.unshift({
      role: 'system',
      content: options.systemPrompt,
    });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'gpt-4o',
      messages: openaiMessages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullResponse = '';
  
  if (!reader) {
    throw new Error('Stream reader not available');
  }
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk
        .split('\n')
        .filter(line => line.trim() !== '' && line.trim() !== 'data: [DONE]');
      
      for (const line of lines) {
        try {
          const match = line.match(/^data: (.*)$/);
          if (!match) continue;
          
          const data = JSON.parse(match[1]);
          const content = data.choices[0]?.delta?.content || '';
          
          if (content) {
            callbacks.onChunk(content);
            fullResponse += content;
          }
        } catch (e) {
          // Skip parsing errors in individual chunks
        }
      }
    }
    
    callbacks.onComplete?.(fullResponse);
  } finally {
    reader.releaseLock();
  }
}

// Claude streaming implementation
async function streamClaude(
  messages: LLMMessage[],
  apiKey: string,
  callbacks: LLMStreamCallbacks,
  options: LLMRequestOptions
): Promise<void> {
  // Implement Claude streaming
  const claudeMessages = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: msg.content,
  }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: options.model || 'claude-3-haiku-20240307',
      messages: claudeMessages,
      system: options.systemPrompt,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `Claude API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullResponse = '';
  
  if (!reader) {
    throw new Error('Stream reader not available');
  }
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk
        .split('\n')
        .filter(line => line.trim() !== '' && line.trim() !== 'data: [DONE]');
      
      for (const line of lines) {
        try {
          const match = line.match(/^data: (.*)$/);
          if (!match) continue;
          
          const data = JSON.parse(match[1]);
          if (data.type === 'content_block_delta') {
            const content = data.delta?.text || '';
            if (content) {
              callbacks.onChunk(content);
              fullResponse += content;
            }
          }
        } catch (e) {
          // Skip parsing errors in individual chunks
        }
      }
    }
    
    callbacks.onComplete?.(fullResponse);
  } finally {
    reader.releaseLock();
  }
}

// Simple in-memory response cache with TTL
// optimization: Reduce redundant API calls
const responseCache = new Map<string, { response: LLMResponse, timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes

export async function callLLMWithCache(
  provider: string,
  messages: LLMMessage[],
  options: LLMRequestOptions = {}
): Promise<LLMResponse> {
  // Create a cache key from the request
  const cacheKey = JSON.stringify({ provider, messages, options });
  
  // Check if we have a cached response
  const cached = responseCache.get(cacheKey);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    console.log('Using cached LLM response');
    return cached.response;
  }
  
  // Otherwise, make a new request
  const response = await callLLM(provider, messages, options);
  
  // Cache the response
  responseCache.set(cacheKey, { response, timestamp: now });
  
  // Prune old cache entries (optimization)
  if (responseCache.size > 100) {
    const entriesToDelete = [];
    for (const [key, value] of responseCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        entriesToDelete.push(key);
      }
    }
    for (const key of entriesToDelete) {
      responseCache.delete(key);
    }
  }
  
  return response;
}