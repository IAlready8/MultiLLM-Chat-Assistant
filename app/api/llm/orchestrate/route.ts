import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { z } from 'zod';

// Define the URL for the Python service, managed by PM2
// This MUST be 127.0.0.1 (localhost) because the Next.js server
// and the Python server are running on the *same machine*.
const PYTHON_CORE_URL = process.env.PYTHON_CORE_URL || 'http://127.0.0.1:8008';

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
): Promise<ProviderResult[]> => {
  const baseUrl = resolveBaseUrl(req)
  const cookieHeader = req.headers.get('cookie') || ''
  const results: ProviderResult[] = []

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
