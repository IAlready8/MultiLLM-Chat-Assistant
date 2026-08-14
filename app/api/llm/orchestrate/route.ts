import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import {
  getProviderDisabledMessage,
  isProviderDisabled,
  PROVIDER_DISABLED_ERROR_CODE,
} from '@/lib/provider-registry'
import { z } from 'zod';

// Define the URL for the Python service, managed by PM2
// This MUST be 127.0.0.1 (localhost) because the Next.js server
// and the Python server are running on the *same machine*.
const PYTHON_CORE_URL = process.env.PYTHON_CORE_URL || 'http://127.0.0.1:8008';
const LOCAL_FALLBACK_ORIGIN = 'http://127.0.0.1:3000'
const ORCHESTRATION_FALLBACK_ERROR_CODE = 'ORCHESTRATION_FALLBACK_UNAVAILABLE'
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

class OrchestrationFallbackError extends Error {
  readonly code = ORCHESTRATION_FALLBACK_ERROR_CODE

  constructor(message = 'A trusted application origin is unavailable.') {
    super(message)
    this.name = 'OrchestrationFallbackError'
  }
}

// Define the schema for the incoming request from the client
const orchestrateRequestSchema = z.object({
  requests: z.array(
    z.object({
      provider: z.string(),
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
  content: string
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  latency_ms: number
}

const COST_PER_1K_TOKENS: Record<string, number> = {
  openai: 0.03,
  anthropic: 0.015,
  googleai: 0.001,
  openrouter: 0.01,
  grok: 0.02,
  kimi: 0.009,
}

const estimatePromptTokens = (prompt: string): number =>
  Math.max(1, Math.round(prompt.length / 4))

const estimateCost = (provider: string, totalTokens: number): number => {
  const rate = COST_PER_1K_TOKENS[provider] ?? 0.01
  return (totalTokens / 1000) * rate
}

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
    content: payload.content || '',
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost_usd: estimateCost(provider, totalTokens),
    latency_ms: latencyMs,
  }
}

const resolveTrustedAppOrigin = (): string => {
  // A Vercel preview must not reuse a production NEXTAUTH_URL with a preview
  // session cookie. Disable this fallback rather than guessing a safe target.
  if (process.env.VERCEL_ENV === 'preview') {
    throw new OrchestrationFallbackError(
      'Local orchestration fallback is disabled in preview deployments.',
    )
  }

  const configuredOrigin = process.env.NEXTAUTH_URL?.trim()
  if (!configuredOrigin) {
    if (process.env.NODE_ENV !== 'production') return LOCAL_FALLBACK_ORIGIN
    throw new OrchestrationFallbackError(
      'NEXTAUTH_URL is required for the local orchestration fallback.',
    )
  }

  let parsedOrigin: URL
  try {
    parsedOrigin = new URL(configuredOrigin)
  } catch {
    throw new OrchestrationFallbackError('NEXTAUTH_URL is invalid.')
  }

  if (
    (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') ||
    parsedOrigin.origin === 'null' ||
    parsedOrigin.username ||
    parsedOrigin.password ||
    parsedOrigin.search ||
    parsedOrigin.hash
  ) {
    throw new OrchestrationFallbackError('NEXTAUTH_URL is invalid.')
  }

  return parsedOrigin.origin
}

const runLocalFallbackOrchestration = async (
  requestData: OrchestrateRequest,
  req: Request
): Promise<ProviderResult[]> => {
  const trustedOrigin = resolveTrustedAppOrigin()
  const cookieHeader = req.headers.get('cookie') || ''
  const results: ProviderResult[] = []

  for (const request of requestData.requests) {
    const startedAt = Date.now()
    const chatResponse = await fetch(`${trustedOrigin}/api/llm/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // The destination is the validated server-side origin above; never
        // derive it from Host or X-Forwarded-Proto request headers.
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
      redirect: 'error',
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

    if (REDIRECT_STATUSES.has(chatResponse.status)) {
      throw new OrchestrationFallbackError(
        'The local orchestration fallback received an unexpected redirect.',
      )
    }

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

      results.push({
        provider: request.provider,
        model: request.model,
        content: `Provider request failed: ${errorMessage}`,
        prompt_tokens: estimatePromptTokens(fallbackPrompt),
        completion_tokens: 0,
        cost_usd: 0,
        latency_ms: latencyMs,
      })
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

const localFallbackResponse = async (
  requestData: OrchestrateRequest,
  req: Request,
  fallbackHeader: string,
): Promise<NextResponse> => {
  try {
    const fallbackResults = await runLocalFallbackOrchestration(requestData, req)
    return NextResponse.json(fallbackResults, {
      status: 200,
      headers: { 'x-orchestration-fallback': fallbackHeader },
    })
  } catch (error: unknown) {
    if (error instanceof OrchestrationFallbackError) {
      console.error('Local orchestration fallback unavailable:', error.message)
    } else {
      console.error('Local orchestration fallback request failed')
    }

    return NextResponse.json(
      {
        error: 'Local orchestration fallback unavailable',
        code: ORCHESTRATION_FALLBACK_ERROR_CODE,
      },
      { status: 503 },
    )
  }
}

/**
 * This API route is the "bridge" to the Python service.
 * It authenticates the user, validates the request,
 * and then proxies the request to the FastAPI backend.
 */
export async function POST(req: Request) {
  // 1. Authenticate the user
  const authCheck = await getAuthenticatedUser();
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

  const disabledProvider = validation.data.requests
    .map((request) => request.provider.trim().toLowerCase())
    .find(isProviderDisabled)
  if (disabledProvider) {
    return NextResponse.json(
      {
        error: getProviderDisabledMessage(disabledProvider),
        code: PROVIDER_DISABLED_ERROR_CODE,
      },
      { status: 503 },
    )
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
        return localFallbackResponse(validation.data, req, 'local')
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

    const data = await pythonResponse.json();
    return NextResponse.json(data);

  } catch (error: unknown) {
    // Handle different types of errors
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Request to Python service timed out, using local fallback');
      return localFallbackResponse(validation.data, req, 'local-timeout')
    } else if (
      error instanceof TypeError &&
      error.message.includes('fetch')
    ) {
      console.error('Network error connecting to Python service, using local fallback:', error.message);
      return localFallbackResponse(validation.data, req, 'local-network')
    } else {
      console.error('Unexpected error connecting to Python service:', error);
      return NextResponse.json(
        { error: 'Internal server error in orchestration service' },
        { status: 500 } // Internal Server Error
      );
    }
  }
}
