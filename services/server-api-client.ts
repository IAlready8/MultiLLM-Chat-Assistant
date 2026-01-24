import { getUserApiKey } from '@/lib/api-key-service'

export interface LLMResponse {
  text: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  metadata?: Record<string, any>
}

export interface LLMRequestOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  stream?: boolean
  onChunk?: (chunk: string) => void
  timeoutMs?: number
  retries?: number
  abortSignal?: AbortSignal
}

/**
 * Server-side LLM API client that uses encrypted API keys from database
 */
export async function callLLMApi(
  userId: string,
  provider: string,
  prompt: string | string[] | any[],
  options: LLMRequestOptions = {}
): Promise<LLMResponse> {
  try {
    // Get encrypted API key from database
    const apiKey = await getUserApiKey(userId, provider)
    if (!apiKey) {
      throw new Error(`No API key configured for ${provider}. Please add your API key in settings.`)
    }
    
    // Apply per-provider networking defaults with env overrides
    const netDefaults = getNetworkDefaults(provider)
    const effOptions: LLMRequestOptions = { ...netDefaults, ...options }
    
    // Provider-specific implementations
    switch (provider) {
      case 'openai':
        return callOpenAI(prompt, apiKey, effOptions)
      case 'openrouter':
        return callOpenRouter(prompt, apiKey, effOptions)
      case 'claude':
      case 'anthropic':
        return callClaude(prompt, apiKey, effOptions)
      case 'google':
      case 'google-ai':
        return callGoogleAI(prompt, apiKey, effOptions)
      case 'llama':
        return callLlama(prompt, apiKey, effOptions)
      case 'github':
        return callGitHubCopilot(prompt, apiKey, effOptions)
      case 'grok':
        return callGrok(prompt, apiKey, effOptions)
      default:
        throw new Error(`Provider ${provider} not supported`)
    }
  } catch (error: any) {
    // Provide more specific error messages for common issues
    if (error.message?.includes('No API key configured')) {
      throw error // Pass through our custom message
    }
    throw error
  }
}

// Helper utilities for robustness and normalization
function isChatMessageArray(arr: any[]): arr is Array<{ role: string; content: string }> {
  return Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object' && arr[0] && 'role' in arr[0] && 'content' in arr[0]
}

function normalizeToOpenAIChatMessages(
  prompt: string | string[] | any[],
  systemPrompt?: string
): Array<{ role: string; content: string }> {
  let messages: Array<{ role: string; content: string }>
  if (Array.isArray(prompt)) {
    if (isChatMessageArray(prompt)) {
      messages = prompt as Array<{ role: string; content: string }>
    } else {
      messages = (prompt as string[]).map((content, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content }))
    }
  } else {
    messages = [{ role: 'user', content: prompt }]
  }
  if (systemPrompt) {
    if (!(messages[0] && messages[0].role === 'system')) {
      messages.unshift({ role: 'system', content: systemPrompt })
    }
  }
  return messages
}

function normalizeToGeminiMessages(
  prompt: string | string[] | any[],
  systemPrompt?: string
): Array<{ role: string; parts: Array<{ text: string }> }> {
  const base = normalizeToOpenAIChatMessages(prompt, systemPrompt)
  return base.map(m => ({ role: m.role === 'assistant' ? 'model' : m.role, parts: [{ text: m.content }] }))
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { timeoutMs?: number; retries?: number; abortSignal?: AbortSignal } = {}
): Promise<Response> {
  const { timeoutMs = 30000, retries = 1, abortSignal } = opts
  let attempt = 0
  let lastErr: any = null
  while (attempt <= retries) {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeoutMs)
    try {
      // Propagate external aborts to our controller
      if (abortSignal) {
        if (abortSignal.aborted) controller.abort(abortSignal.reason as any)
        const onAbort = () => controller.abort((abortSignal as any).reason)
        abortSignal.addEventListener('abort', onAbort, { once: true })
        try {
          const res = await fetch(url, { ...init, signal: controller.signal })
          clearTimeout(id)
          if (res.status >= 500 || res.status === 429) {
            if (attempt < retries) {
              const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
              await new Promise(r => setTimeout(r, delay))
              attempt++
              continue
            }
          }
          return res
        } finally {
          abortSignal.removeEventListener('abort', onAbort as any)
        }
      } else {
        const res = await fetch(url, { ...init, signal: controller.signal })
        clearTimeout(id)
        if (res.status >= 500 || res.status === 429) {
          if (attempt < retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
            await new Promise(r => setTimeout(r, delay))
            attempt++
            continue
          }
        }
        return res
      }
    } catch (e: any) {
      clearTimeout(id)
      lastErr = e
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
        await new Promise(r => setTimeout(r, delay))
        attempt++
        continue
      }
      throw e
    }
  }
  throw lastErr ?? new Error('Request failed')
}

function getNetworkDefaults(provider: string): { timeoutMs?: number; retries?: number } {
  const readInt = (v?: string) => {
    const n = v ? parseInt(v, 10) : NaN
    return Number.isFinite(n) ? n : undefined
  }

  // Global env overrides
  const globalTimeout = readInt(process.env.LLM_FETCH_TIMEOUT_MS)
  const globalRetries = readInt(process.env.LLM_FETCH_RETRIES)

  // Sensible per-provider defaults
  const base: Record<string, { timeoutMs: number; retries: number }> = {
    openai: { timeoutMs: 30000, retries: 1 },
    claude: { timeoutMs: 45000, retries: 1 },
    anthropic: { timeoutMs: 45000, retries: 1 },
    google: { timeoutMs: 30000, retries: 1 },
    'google-ai': { timeoutMs: 30000, retries: 1 },
    openrouter: { timeoutMs: 35000, retries: 2 },
    grok: { timeoutMs: 30000, retries: 1 },
    github: { timeoutMs: 25000, retries: 0 },
    llama: { timeoutMs: 15000, retries: 0 },
  }

  const d = base[provider] || { timeoutMs: 30000, retries: 1 }
  return {
    timeoutMs: globalTimeout ?? d.timeoutMs,
    retries: globalRetries ?? d.retries,
  }
}

// Provider implementations (same as in api-client.ts but server-side only)
async function callOpenRouter(
  prompt: string | string[] | any[],
  apiKey: string,
  options: LLMRequestOptions
): Promise<LLMResponse> {
  const messages = normalizeToOpenAIChatMessages(prompt, options.systemPrompt)

  const response = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost',
      'X-Title': process.env.NEXT_PUBLIC_APP_NAME || 'MultiLLM Chat Assistant',
    },
    body: JSON.stringify({
      model: options.model || 'openrouter/auto',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: options.stream ?? false,
    }),
  }, { timeoutMs: options.timeoutMs, retries: options.retries, abortSignal: options.abortSignal })

  if (options.stream && options.onChunk && response.ok && response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6))
            const content = data.choices?.[0]?.delta?.content
            if (content) options.onChunk(content)
          } catch (e) {
            console.error('Error parsing streaming response:', e)
          }
        }
      }
    }

    return { text: 'Streaming response complete' }
  }

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'Error calling OpenRouter API')
  }

  const content = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.delta?.content ?? ''
  const usage = data.usage || {}

  return {
    text: content,
    usage: {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
    },
    metadata: {
      model: data.model,
      id: data.id,
    },
  }
}

async function callOpenAI(
  prompt: string | string[] | any[],
  apiKey: string,
  options: LLMRequestOptions
): Promise<LLMResponse> {
  const messages = normalizeToOpenAIChatMessages(prompt, options.systemPrompt)

  const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'gpt-4o',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: options.stream ?? false,
    }),
  }, { timeoutMs: options.timeoutMs, retries: options.retries, abortSignal: options.abortSignal })

  if (options.stream && options.onChunk && response.ok && response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6))
            const content = data.choices[0]?.delta?.content
            if (content) options.onChunk(content)
          } catch (e) {
            console.error('Error parsing streaming response:', e)
          }
        }
      }
    }

    return { text: 'Streaming response complete' }
  }

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'Error calling OpenAI API')
  }

  return {
    text: data.choices[0].message.content,
    usage: {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    },
  }
}

async function callClaude(
  prompt: string | string[] | any[],
  apiKey: string,
  options: LLMRequestOptions
): Promise<LLMResponse> {
  const messages = normalizeToOpenAIChatMessages(prompt, options.systemPrompt)

  const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: options.model || 'claude-3-opus-20240229',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: options.stream ?? false,
    }),
  }, { timeoutMs: options.timeoutMs, retries: options.retries, abortSignal: options.abortSignal })

  if (options.stream && options.onChunk && response.ok && response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6))
            const content = data.delta?.text
            if (content) options.onChunk(content)
          } catch (e) {
            console.error('Error parsing streaming response:', e)
          }
        }
      }
    }

    return { text: 'Streaming response complete' }
  }

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'Error calling Claude API')
  }

  return {
    text: data.content[0].text,
    usage: {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  }
}

async function callGoogleAI(
  prompt: string | string[] | any[],
  apiKey: string,
  options: LLMRequestOptions
): Promise<LLMResponse> {
  const messages = normalizeToGeminiMessages(prompt, options.systemPrompt)

  const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${options.model || 'gemini-pro'}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: messages,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 2048,
      },
    }),
  }, { timeoutMs: options.timeoutMs, retries: options.retries, abortSignal: options.abortSignal })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'Error calling Google AI API')
  }

  return {
    text: data.candidates[0].content.parts[0].text,
    metadata: {
      safetyRatings: data.candidates[0].safetyRatings,
    },
  }
}

async function callLlama(
  prompt: string | string[] | any[],
  apiKey: string,
  options: LLMRequestOptions
): Promise<LLMResponse> {
  const messages = normalizeToOpenAIChatMessages(prompt, options.systemPrompt)

  try {
    const response = await fetchWithRetry('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'llama2',
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 2048,
        },
      }),
    }, { timeoutMs: options.timeoutMs, retries: options.retries, abortSignal: options.abortSignal })

    if (!response.ok) throw new Error('Ollama not available')

    const data = await response.json()

    return {
      text: data.message?.content || data.response || 'No response',
      usage: {
        promptTokens: data.prompt_eval_count || 20,
        completionTokens: data.eval_count || 50,
        totalTokens: (data.prompt_eval_count || 20) + (data.eval_count || 50),
      },
      metadata: {
        model: data.model,
        done: data.done,
      },
    }
  } catch (error) {
    // Fallback to simulated response if Ollama not available
    console.warn('Ollama not available, using simulated response')
    await new Promise(resolve => setTimeout(resolve, 1000))

    return {
      text: `Llama response: ${Array.isArray(prompt) ? prompt[prompt.length - 1] : prompt}`,
      usage: {
        promptTokens: 20,
        completionTokens: 50,
        totalTokens: 70,
      },
    }
  }
}

async function callGitHubCopilot(
  prompt: string | string[] | any[],
  apiKey: string,
  options: LLMRequestOptions
): Promise<LLMResponse> {
  const messages = normalizeToOpenAIChatMessages(prompt, options.systemPrompt)

  try {
    const response = await fetchWithRetry('https://api.githubcopilot.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Editor-Version': 'vscode/1.85.0',
        'Editor-Plugin-Version': 'copilot-chat/0.11.1',
        'User-Agent': 'GitHubCopilotChat/0.11.1',
      },
      body: JSON.stringify({
        messages,
        model: options.model || 'gpt-4',
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        stream: options.stream ?? false,
      }),
    }, { timeoutMs: options.timeoutMs, retries: options.retries, abortSignal: options.abortSignal })

    if (!response.ok) throw new Error('GitHub Copilot not available')

    const data = await response.json()

    return {
      text: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 15,
        completionTokens: data.usage?.completion_tokens || 45,
        totalTokens: data.usage?.total_tokens || 60,
      },
    }
  } catch (error) {
    // Fallback to simulated response if GitHub Copilot not available
    console.warn('GitHub Copilot not available, using simulated response')
    await new Promise(resolve => setTimeout(resolve, 1000))

    return {
      text: `GitHub Copilot response: ${Array.isArray(prompt) ? prompt[prompt.length - 1] : prompt}`,
      usage: {
        promptTokens: 15,
        completionTokens: 45,
        totalTokens: 60,
      },
    }
  }
}

async function callGrok(
  prompt: string | string[] | any[],
  apiKey: string,
  options: LLMRequestOptions
): Promise<LLMResponse> {
  const messages = normalizeToOpenAIChatMessages(prompt, options.systemPrompt)

  try {
    const response = await fetchWithRetry('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'grok-beta',
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        stream: options.stream ?? false,
      }),
    }, { timeoutMs: options.timeoutMs, retries: options.retries })

    if (!response.ok) throw new Error('Grok API not available')

    const data = await response.json()

    return {
      text: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 18,
        completionTokens: data.usage?.completion_tokens || 55,
        totalTokens: data.usage?.total_tokens || 73,
      },
    }
  } catch (error) {
    // Fallback to simulated response if Grok not available
    console.warn('Grok API not available, using simulated response')
    await new Promise(resolve => setTimeout(resolve, 1000))

    return {
      text: `Grok response: ${Array.isArray(prompt) ? prompt[prompt.length - 1] : prompt}`,
      usage: {
        promptTokens: 18,
        completionTokens: 55,
        totalTokens: 73,
      },
    }
  }
}