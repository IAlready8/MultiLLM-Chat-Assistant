import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { classifyProviderError } from '@/lib/providers'
import { z } from 'zod';

// Define the URL for the Python service, managed by PM2
// This MUST be 127.0.0.1 (localhost) because the Next.js server
// and the Python server are running on the *same machine*.
const PYTHON_CORE_URL = process.env.PYTHON_CORE_URL || 'http://127.0.0.1:8008';

// Define the schema for the incoming request from the client
const providerIdSchema = z.enum([
  'openai',
  'openrouter',
  'anthropic',
  'googleai',
  'grok',
  'ollama',
  'mistral',
])

const orchestrateRequestSchema = z.object({
  requests: z.array(
    z.object({
      provider: providerIdSchema,
      model: z.string(),
      prompt: z.string(),
    })
  ),
  prompt: z.string(),
});

type OrchestrateRequest = z.infer<typeof orchestrateRequestSchema>

type ChatResponsePayload = {
  content?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

type ProviderResult = {
  provider: string
  model: string
  success: true
  content: string
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  latency_ms: number
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  latencyMs: number
}

type ProviderErrorResult = {
  provider: string
  model: string
  success: false
  error: {
    code: string
    message: string
    retryable: boolean
  }
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  latency_ms: number
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  latencyMs: number
}

type OrchestrateResult = ProviderResult | ProviderErrorResult

const COST_PER_1K_TOKENS: Record<string, number> = {
  openai: 0.03,
  anthropic: 0.015,
  googleai: 0.001,
  openrouter: 0.01,
  grok: 0.02,
}

const estimatePromptTokens = (prompt: string): number =>
  Math.max(1, Math.round(prompt.length / 4))

const estimateCost = (provider: string, totalTokens: number): number => {
  const rate = COST_PER_1K_TOKENS[provider] ?? 0.01
  return (totalTokens / 1000) * rate
}

const isRetryableProviderError = (code: string): boolean =>
  [
    'PROVIDER_TIMEOUT',
    'PROVIDER_UNAVAILABLE',
    'NETWORK_ERROR',
    'RATE_LIMITED',
    'SIDECAR_UNAVAILABLE',
    'SIDECAR_BAD_RESPONSE',
  ].includes(code)

const looksLikeErrorContent = (content: string | undefined): boolean => {
  const normalized = content?.trim().toLowerCase() || ''
  return (
    normalized.startsWith('error') ||
    normalized.startsWith('provider request failed') ||
    normalized.startsWith('request validation error')
  )
}

const toProviderErrorResult = (
  provider: string,
  model: string,
  error: { code: string; message: string; retryable?: boolean },
  latencyMs: number,
  prompt: string
): ProviderErrorResult => ({
  provider,
  model,
  success: false,
  error: {
    code: error.code,
    message: error.message,
    retryable: error.retryable ?? isRetryableProviderError(error.code),
  },
  prompt_tokens: estimatePromptTokens(prompt),
  completion_tokens: 0,
  cost_usd: 0,
  latency_ms: latencyMs,
  usage: {
    inputTokens: estimatePromptTokens(prompt),
    outputTokens: 0,
    totalTokens: estimatePromptTokens(prompt),
  },
  latencyMs,
})

const toProviderResult = (
  provider: string,
  model: string,
  payload: ChatResponsePayload,
  latencyMs: number,
  prompt: string
): ProviderResult => {
  const promptTokens =
    payload.usage?.prompt_tokens ?? estimatePromptTokens(prompt)
  const completionTokens =
    payload.usage?.completion_tokens ??
    Math.max(1, Math.round((payload.content || '').length / 4))
  const totalTokens =
    payload.usage?.total_tokens ?? promptTokens + completionTokens

  return {
    provider,
    model,
    success: true,
    content: payload.content || '',
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost_usd: estimateCost(provider, totalTokens),
    latency_ms: latencyMs,
    usage: {
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      totalTokens,
    },
    latencyMs,
  }
}

const normalizePythonResults = (data: unknown): OrchestrateResult[] => {
  if (!Array.isArray(data)) {
    throw new Error('Python service returned a non-array orchestration response')
  }

  return data.map((item: any) => {
    const provider = typeof item?.provider === 'string' ? item.provider : 'unknown'
    const model = typeof item?.model === 'string' ? item.model : ''
    const latencyMs =
      typeof item?.latency_ms === 'number'
        ? item.latency_ms
        : typeof item?.latencyMs === 'number'
          ? item.latencyMs
          : 0

    if (item?.success === false || item?.error || looksLikeErrorContent(item?.content)) {
      const mapped = item?.error
        ? {
            code: String(item.error.code || 'UNKNOWN_PROVIDER_ERROR'),
            message: String(item.error.message || item.error.error || 'Provider request failed'),
            retryable:
              typeof item.error.retryable === 'boolean'
                ? item.error.retryable
                : undefined,
          }
        : classifyProviderError(new Error(String(item?.content || 'Provider request failed')))

      return toProviderErrorResult(
        provider,
        model,
        {
          code: mapped.code,
          message: 'error' in mapped ? mapped.error : mapped.message,
          retryable:
            'retryable' in mapped && typeof mapped.retryable === 'boolean'
              ? mapped.retryable
              : undefined,
        },
        latencyMs,
        ''
      )
    }

    const promptTokens =
      typeof item?.prompt_tokens === 'number'
        ? item.prompt_tokens
        : typeof item?.usage?.inputTokens === 'number'
          ? item.usage.inputTokens
          : 0
    const completionTokens =
      typeof item?.completion_tokens === 'number'
        ? item.completion_tokens
        : typeof item?.usage?.outputTokens === 'number'
          ? item.usage.outputTokens
          : Math.max(1, Math.round(String(item?.content || '').length / 4))
    const totalTokens = promptTokens + completionTokens

    return {
      provider,
      model,
      success: true,
      content: String(item?.content || ''),
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd:
        typeof item?.cost_usd === 'number'
          ? item.cost_usd
          : estimateCost(provider, totalTokens),
      latency_ms: latencyMs,
      usage: {
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        totalTokens,
      },
      latencyMs,
    }
  })
}

const resolveBaseUrl = (req: Request): string => {
  const host = req.headers.get('host') || 'localhost:3000'
  const forwardedProto = req.headers.get('x-forwarded-proto')
  const protocol =
    forwardedProto ||
    (host.includes('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
  return `${protocol}://${host}`
}

const runLocalFallbackOrchestration = async (
  requestData: OrchestrateRequest,
  req: Request
): Promise<OrchestrateResult[]> => {
  const baseUrl = resolveBaseUrl(req)
  const cookieHeader = req.headers.get('cookie') || ''
  const results: OrchestrateResult[] = []

  for (const request of requestData.requests) {
    const startedAt = Date.now()
    const chatResponse = await fetch(`${baseUrl}/api/llm/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({
        provider: request.provider,
        model: request.model,
        stream: false,
        messages: [
          {
            role: 'user',
            content: request.prompt || requestData.prompt,
          },
        ],
      }),
    })

    const latencyMs = Date.now() - startedAt
    const fallbackPrompt = request.prompt || requestData.prompt

    if (!chatResponse.ok) {
      let errorMessage = `HTTP ${chatResponse.status}`
      try {
        const errorPayload = await chatResponse.json()
        errorMessage = errorPayload?.error || errorPayload?.details || errorMessage
      } catch {
        // Ignore parsing errors and use status-based message
      }

      const mapped = classifyProviderError(
        new Error(`HTTP ${chatResponse.status}: ${errorMessage}`)
      )
      results.push(
        toProviderErrorResult(
          request.provider,
          request.model,
          {
            code: mapped.code,
            message: mapped.error,
          },
          latencyMs,
          fallbackPrompt
        )
      )
      continue
    }

    const payload = (await chatResponse.json()) as ChatResponsePayload
    results.push(
      toProviderResult(
        request.provider,
        request.model,
        payload,
        latencyMs,
        fallbackPrompt
      )
    )
  }

  return results
}

/**
 * This API route is the "bridge" to the Python service.
 * It authenticates the user, validates the request,
 * and then proxies the request to the FastAPI backend.
 */
export async function POST(req: Request) {
  // 1. Authenticate the user
  const authCheck = await getAuthenticatedUser({ allowGuest: true });
  if (authCheck instanceof NextResponse) return authCheck;
  // const { user } = authCheck // We have the user if we need to log their usage

  let body;
  try {
    body = await req.json();
  } catch (error) {
    console.error('Failed to parse JSON body:', error);
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // 2. Validate the request body
  const validation = orchestrateRequestSchema.safeParse(body);
  if (!validation.success) {
    console.error('Request validation failed:', validation.error.flatten());
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.flatten() },
      { status: 400 }
    );
  }

  // 3. Proxy the request to the Python (FastAPI) service
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    const pythonResponse = await fetch(
      `${PYTHON_CORE_URL}/api/v1/llm/orchestrate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(validation.data),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!pythonResponse.ok) {
      // Log the error response from Python service
      let errorData;
      try {
        errorData = await pythonResponse.json();
      } catch (parseError) {
        // If response isn't JSON, try to get text
        try {
          const errorText = await pythonResponse.text();
          errorData = { detail: errorText };
        } catch (textError) {
          errorData = { detail: 'Unable to parse error response from Python service' };
        }
      }

      console.error(`Python service returned ${pythonResponse.status}:`, errorData);

      // Map Python service status codes to appropriate HTTP responses
      let statusCode = pythonResponse.status;
      if (statusCode === 401) {
        statusCode = 401; // Unauthorized
      } else if (statusCode === 429) {
        statusCode = 429; // Too Many Requests
      } else if (statusCode >= 500) {
        statusCode = 502; // Bad Gateway (since it's a service error)
      } else if (statusCode >= 400) {
        statusCode = 400; // Bad Request for other client errors
      }

      // When Python is unavailable or unhealthy, use local fallback orchestration.
      if (statusCode >= 502 || pythonResponse.status >= 500) {
        const fallbackResults = await runLocalFallbackOrchestration(validation.data, req)
        return NextResponse.json(fallbackResults, {
          status: 200,
          headers: { 'x-orchestration-fallback': 'local' },
        })
      }

      if (pythonResponse.status === 422) {
        const fallbackResults = await runLocalFallbackOrchestration(validation.data, req)
        return NextResponse.json(fallbackResults, {
          status: 200,
          headers: { 'x-orchestration-fallback': 'local-validation' },
        })
      }

      return NextResponse.json(
        {
          error: 'Python service error',
          details: errorData.detail || 'No details from service',
          status: pythonResponse.status,
        },
        { status: statusCode }
      )
    }

    let data: unknown
    try {
      data = await pythonResponse.json();
    } catch (error) {
      console.error('Python service returned an invalid JSON response:', error)
      const fallbackResults = await runLocalFallbackOrchestration(validation.data, req)
      return NextResponse.json(fallbackResults, {
        status: 200,
        headers: { 'x-orchestration-fallback': 'local-bad-response' },
      })
    }

    try {
      return NextResponse.json(normalizePythonResults(data));
    } catch (error) {
      console.error('Python service returned an unexpected orchestration shape:', error)
      const fallbackResults = await runLocalFallbackOrchestration(validation.data, req)
      return NextResponse.json(fallbackResults, {
        status: 200,
        headers: { 'x-orchestration-fallback': 'local-bad-response' },
      })
    }

  } catch (error: any) {
    // Handle different types of errors
    if (error.name === 'AbortError') {
      console.error('Request to Python service timed out, using local fallback');
      const fallbackResults = await runLocalFallbackOrchestration(validation.data, req)
      return NextResponse.json(fallbackResults, {
        status: 200,
        headers: { 'x-orchestration-fallback': 'local-timeout' },
      })
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('Network error connecting to Python service, using local fallback:', error.message);
      const fallbackResults = await runLocalFallbackOrchestration(validation.data, req)
      return NextResponse.json(fallbackResults, {
        status: 200,
        headers: { 'x-orchestration-fallback': 'local-network' },
      })
    } else {
      console.error('Unexpected error connecting to Python service:', error);
      return NextResponse.json(
        { error: 'Internal server error in orchestration service' },
        { status: 500 } // Internal Server Error
      );
    }
  }
}
