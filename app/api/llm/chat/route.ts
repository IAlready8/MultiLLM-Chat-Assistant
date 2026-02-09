import { NextRequest, NextResponse } from 'next/server';
import { errorManager, createErrorContext, LLMProviderError, NotImplementedError } from '@/lib/error-system';
import { getUserApiKey, getUserProviderConfigs } from '@/lib/api-key-service';
import { getAuthenticatedUser } from '@/lib/api-auth'
import { recordAnalyticsEvent } from '@/services/analytics-service'

type ChatRouteError = {
    status: number;
    code: string;
    error: string;
};

const getUpstreamErrorMessage = async (response: Response): Promise<string> => {
    const errorBody = await response.json().catch(() => ({} as Record<string, any>));
    const detail =
        errorBody?.error?.message ||
        errorBody?.message ||
        errorBody?.detail;
    return detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}`;
};

const jsonErrorResponse = (status: number, error: string, code: string) =>
    new NextResponse(
        JSON.stringify({ error, code }),
        { status, headers: { 'Content-Type': 'application/json' } }
    );

const parseStatusFromMessage = (message: string): number | null => {
    const match = message.match(/\bHTTP\s+(\d{3})\b/i);
    if (!match) {
        return null;
    }
    const status = Number(match[1]);
    return Number.isFinite(status) ? status : null;
};

const mapErrorToResponse = (error: unknown): ChatRouteError => {
    if (error instanceof SyntaxError) {
        return {
            status: 400,
            code: 'INVALID_JSON',
            error: 'Request body must be valid JSON',
        };
    }

    if (error instanceof NotImplementedError) {
        return {
            status: 501,
            code: 'FEATURE_NOT_IMPLEMENTED',
            error: error.userMessage || 'This feature is not yet available.',
        };
    }

    const message =
        error instanceof Error
            ? error.message
            : 'An internal server error occurred';
    const lowerMessage = message.toLowerCase();
    const upstreamStatus = parseStatusFromMessage(message);

    if (upstreamStatus === 401 || upstreamStatus === 403) {
        return {
            status: 401,
            code: 'PROVIDER_AUTH_ERROR',
            error: 'Provider rejected the configured API key',
        };
    }

    if (upstreamStatus === 429) {
        return {
            status: 429,
            code: 'RATE_LIMITED',
            error: 'Provider rate limit reached, please retry shortly',
        };
    }

    if (upstreamStatus !== null && upstreamStatus >= 500) {
        return {
            status: 503,
            code: 'PROVIDER_UNAVAILABLE',
            error: 'Provider is currently unavailable',
        };
    }

    if (
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('timed out') ||
        lowerMessage.includes('abort')
    ) {
        return {
            status: 504,
            code: 'PROVIDER_TIMEOUT',
            error: 'Provider request timed out',
        };
    }

    if (
        lowerMessage.includes('fetch failed') ||
        lowerMessage.includes('network') ||
        lowerMessage.includes('econnrefused') ||
        lowerMessage.includes('enotfound') ||
        lowerMessage.includes('eai_again')
    ) {
        return {
            status: 503,
            code: 'NETWORK_ERROR',
            error: 'Failed to reach upstream provider',
        };
    }

    if (upstreamStatus !== null && upstreamStatus >= 400) {
        return {
            status: 400,
            code: 'PROVIDER_REQUEST_ERROR',
            error: message,
        };
    }

    return {
        status: 500,
        code: 'INTERNAL_ERROR',
        error: message,
    };
};

// ===== Grok (X.AI) Provider Logic =====
async function chatGrok(
    request: any,
    apiKey: string,
    baseUrl?: string,
    extraHeaders: Record<string, string> = {}
): Promise<any> {
    const effectiveBaseUrl = baseUrl || 'https://api.x.ai/v1';
    const model = request.model || 'grok-beta';

    const response = await fetch(`${effectiveBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, ...extraHeaders },
        body: JSON.stringify({
            model,
            messages: request.messages,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.max_tokens ?? 4096,
            stream: false,
        }),
        signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
        const providerError = await getUpstreamErrorMessage(response);
        throw new LLMProviderError('grok', providerError, createErrorContext('/api/llm/chat', request.userId, { streaming: false }));
    }
    const data = await response.json();
    return { content: data.choices[0].message?.content || '', finish_reason: data.choices[0].finish_reason, usage: data.usage };
}

async function* streamGrok(
    request: any,
    apiKey: string,
    baseUrl?: string,
    extraHeaders: Record<string, string> = {}
): AsyncGenerator<string, void, undefined> {
    const effectiveBaseUrl = baseUrl || 'https://api.x.ai/v1';
    const model = request.model || 'grok-beta';

    const response = await fetch(`${effectiveBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, ...extraHeaders },
        body: JSON.stringify({
            model,
            messages: request.messages,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.max_tokens ?? 4096,
            stream: true,
        }),
    });

    if (!response.ok) {
        const providerError = await getUpstreamErrorMessage(response);
        throw new LLMProviderError('grok', providerError, createErrorContext('/api/llm/chat', request.userId, { streaming: true }));
    }

    if (!response.body) throw new LLMProviderError('grok', 'No response body received', createErrorContext('/api/llm/chat', request.userId));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const lines = decoder.decode(value, { stream: true }).split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') return;
                    try {
                        const content = JSON.parse(data).choices[0]?.delta?.content;
                        if (content) yield content;
                    } catch (e) { /* Ignore malformed JSON */ }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

// ===== Anthropic Provider Logic =====
async function chatAnthropic(
    request: any,
    apiKey: string,
    baseUrl?: string,
    extraHeaders: Record<string, string> = {}
): Promise<any> {
    const effectiveBaseUrl = baseUrl || 'https://api.anthropic.com';
    const model = request.model || 'claude-3-sonnet-20240229';

    // Anthropic uses different message format - filter out system messages
    const systemMessage = request.messages.find((m: any) => m.role === 'system');
    const nonSystemMessages = request.messages.filter((m: any) => m.role !== 'system');

    const response = await fetch(`${effectiveBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            ...extraHeaders
        },
        body: JSON.stringify({
            model,
            messages: nonSystemMessages,
            system: systemMessage?.content,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.max_tokens ?? 4096,
        }),
        signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
        const providerError = await getUpstreamErrorMessage(response);
        throw new LLMProviderError('anthropic', providerError, createErrorContext('/api/llm/chat', request.userId, { streaming: false }));
    }
    const data = await response.json();
    return {
        content: data.content[0]?.text || '',
        finish_reason: data.stop_reason,
        usage: {
            prompt_tokens: data.usage?.input_tokens,
            completion_tokens: data.usage?.output_tokens,
            total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
        }
    };
}

async function* streamAnthropic(
    request: any,
    apiKey: string,
    baseUrl?: string,
    extraHeaders: Record<string, string> = {}
): AsyncGenerator<string, void, undefined> {
    const effectiveBaseUrl = baseUrl || 'https://api.anthropic.com';
    const model = request.model || 'claude-3-sonnet-20240229';

    const systemMessage = request.messages.find((m: any) => m.role === 'system');
    const nonSystemMessages = request.messages.filter((m: any) => m.role !== 'system');

    const response = await fetch(`${effectiveBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            ...extraHeaders
        },
        body: JSON.stringify({
            model,
            messages: nonSystemMessages,
            system: systemMessage?.content,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.max_tokens ?? 4096,
            stream: true,
        }),
    });

    if (!response.ok) {
        const providerError = await getUpstreamErrorMessage(response);
        throw new LLMProviderError('anthropic', providerError, createErrorContext('/api/llm/chat', request.userId, { streaming: true }));
    }

    if (!response.body) throw new LLMProviderError('anthropic', 'No response body received', createErrorContext('/api/llm/chat', request.userId));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const lines = decoder.decode(value, { stream: true }).split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') return;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                            yield parsed.delta.text;
                        }
                    } catch (e) { /* Ignore malformed JSON */ }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

// ===== Google AI Provider Logic =====
async function chatGoogleAI(
    request: any,
    apiKey: string,
    baseUrl?: string,
    extraHeaders: Record<string, string> = {}
): Promise<any> {
    const model = request.model || 'gemini-1.5-flash';

    // Convert OpenAI-style messages to Gemini format
    const systemInstruction = request.messages.find((m: any) => m.role === 'system')?.content;
    const contents = request.messages
        .filter((m: any) => m.role !== 'system')
        .map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify({
            contents,
            systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
            generationConfig: {
                temperature: request.temperature ?? 0.7,
                maxOutputTokens: request.max_tokens ?? 4096,
            }
        }),
        signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
        const providerError = await getUpstreamErrorMessage(response);
        throw new LLMProviderError('googleai', providerError, createErrorContext('/api/llm/chat', request.userId, { streaming: false }));
    }
    const data = await response.json();
    return {
        content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
        finish_reason: data.candidates?.[0]?.finishReason,
        usage: {
            prompt_tokens: data.usageMetadata?.promptTokenCount,
            completion_tokens: data.usageMetadata?.candidatesTokenCount,
            total_tokens: data.usageMetadata?.totalTokenCount
        }
    };
}

async function* streamGoogleAI(
    request: any,
    apiKey: string,
    baseUrl?: string,
    extraHeaders: Record<string, string> = {}
): AsyncGenerator<string, void, undefined> {
    const model = request.model || 'gemini-1.5-flash';

    const systemInstruction = request.messages.find((m: any) => m.role === 'system')?.content;
    const contents = request.messages
        .filter((m: any) => m.role !== 'system')
        .map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify({
            contents,
            systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
            generationConfig: {
                temperature: request.temperature ?? 0.7,
                maxOutputTokens: request.max_tokens ?? 4096,
            }
        }),
    });

    if (!response.ok) {
        const providerError = await getUpstreamErrorMessage(response);
        throw new LLMProviderError('googleai', providerError, createErrorContext('/api/llm/chat', request.userId, { streaming: true }));
    }

    if (!response.body) throw new LLMProviderError('googleai', 'No response body received', createErrorContext('/api/llm/chat', request.userId));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const lines = decoder.decode(value, { stream: true }).split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    try {
                        const parsed = JSON.parse(data);
                        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (text) yield text;
                    } catch (e) { /* Ignore malformed JSON */ }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

// ===== OpenAI Provider Logic =====
async function chatOpenAI(
    request: any,
    apiKey: string,
    baseUrl?: string,
    extraHeaders: Record<string, string> = {}
): Promise<any> {
    const effectiveBaseUrl = baseUrl || 'https://api.openai.com/v1';
    const model = request.model || 'gpt-3.5-turbo';

    const response = await fetch(`${effectiveBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, ...extraHeaders },
        body: JSON.stringify({
            model,
            messages: request.messages,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.max_tokens ?? 4096,
            stream: false,
        }),
        signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
        const providerError = await getUpstreamErrorMessage(response);
        throw new LLMProviderError('openai', providerError, createErrorContext('/api/llm/chat', request.userId, { streaming: false }));
    }
    const data = await response.json();
    return { content: data.choices[0].message?.content || '', finish_reason: data.choices[0].finish_reason, usage: data.usage };
}

async function* streamOpenAI(
    request: any,
    apiKey: string,
    baseUrl?: string,
    extraHeaders: Record<string, string> = {}
): AsyncGenerator<string, void, undefined> {
    const effectiveBaseUrl = baseUrl || 'https://api.openai.com/v1';
    const model = request.model || 'gpt-3.5-turbo';

    const response = await fetch(`${effectiveBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, ...extraHeaders },
        body: JSON.stringify({
            model,
            messages: request.messages,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.max_tokens ?? 4096,
            stream: true,
        }),
    });

    if (!response.ok) {
        const providerError = await getUpstreamErrorMessage(response);
        throw new LLMProviderError('openai', providerError, createErrorContext('/api/llm/chat', request.userId, { streaming: true }));
    }

    if (!response.body) throw new LLMProviderError('openai', 'No response body received', createErrorContext('/api/llm/chat', request.userId));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const lines = decoder.decode(value, { stream: true }).split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') return;
                    try {
                        const content = JSON.parse(data).choices[0]?.delta?.content;
                        if (content) yield content;
                    } catch (e) { /* Ignore malformed JSON */ }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

// ===== Provider Factory =====
const providerFactory = {
    openai: {
        chat: chatOpenAI,
        stream: streamOpenAI,
    },
    openrouter: {
        chat: chatOpenAI,
        stream: streamOpenAI,
    },
    anthropic: {
        chat: chatAnthropic,
        stream: streamAnthropic,
    },
    googleai: {
        chat: chatGoogleAI,
        stream: streamGoogleAI,
    },
    grok: {
        chat: chatGrok,
        stream: streamGrok,
    },
};

const estimatePromptTokens = (messages: any[]): number => {
    const contentLength = messages.reduce((acc, message) => {
        if (!message || typeof message.content !== 'string') return acc;
        return acc + message.content.length;
    }, 0);
    return Math.max(1, Math.round(contentLength / 4));
};

const extractTotalTokens = (usage: any, fallbackTotal: number): number => {
    if (usage && typeof usage.total_tokens === 'number') {
        return usage.total_tokens;
    }
    if (usage && typeof usage.totalTokens === 'number') {
        return usage.totalTokens;
    }
    const promptTokens =
        (usage && typeof usage.prompt_tokens === 'number' && usage.prompt_tokens) ||
        (usage && typeof usage.promptTokens === 'number' && usage.promptTokens) ||
        0;
    const completionTokens =
        (usage && typeof usage.completion_tokens === 'number' && usage.completion_tokens) ||
        (usage && typeof usage.completionTokens === 'number' && usage.completionTokens) ||
        0;
    const combined = promptTokens + completionTokens;
    return combined > 0 ? combined : fallbackTotal;
};

const safeRecordEvent = async (event: {
    event: string;
    userId: string;
    payload?: Record<string, unknown>;
}) => {
    try {
        await recordAnalyticsEvent(event);
    } catch (error) {
        console.warn('Failed to record analytics event:', error);
    }
};

// ===== Main POST Handler =====
export async function POST(req: NextRequest) {
    let analyticsUserId: string | null = null;
    let analyticsProvider = 'unknown';
    let analyticsModel = 'unknown';

    try {
        const authCheck = await getAuthenticatedUser({ allowGuest: true })
        if (authCheck instanceof NextResponse) return authCheck
        const { user } = authCheck
        const userId = user.id
        analyticsUserId = userId

        const body = await req.json();
        const { provider: providerRaw = 'openai', messages, model, temperature, max_tokens, stream = true } = body;
        if (typeof providerRaw !== 'string' || providerRaw.trim().length === 0) {
            return jsonErrorResponse(400, 'Provider is required', 'VALIDATION_ERROR');
        }
        const provider = providerRaw.trim().toLowerCase();
        analyticsProvider = provider;
        analyticsModel = typeof model === 'string' && model.trim() ? model : 'default';

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return jsonErrorResponse(400, 'Messages are required', 'VALIDATION_ERROR');
        }

        const providerImplementation = providerFactory[provider as keyof typeof providerFactory];
        if (!providerImplementation) {
            return jsonErrorResponse(400, `Provider '${provider}' not supported`, 'PROVIDER_UNSUPPORTED');
        }

        const providerConfigs = await getUserProviderConfigs(userId);
        const providerConfig = providerConfigs.find(config => config.provider === provider);
        if (!providerConfig) {
            return jsonErrorResponse(400, `Provider ${provider} not configured`, 'PROVIDER_NOT_CONFIGURED');
        }

        const apiKey = await getUserApiKey(userId, provider);
        if (!apiKey) {
            return jsonErrorResponse(400, `Provider ${provider} not configured`, 'PROVIDER_NOT_CONFIGURED');
        }
        const requestPayload = { messages, model, temperature, max_tokens, userId };
        // Parse settings JSON for baseUrl if available
        const settings = providerConfig.settings || {};
        const defaultBaseUrl = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined;
        const baseUrl = settings.baseUrl || defaultBaseUrl;
        const extraHeaders: Record<string, string> = {};
        if (provider === 'openrouter') {
            if (settings.httpReferer) {
                extraHeaders['HTTP-Referer'] = settings.httpReferer;
            }
            if (settings.xTitle) {
                extraHeaders['X-Title'] = settings.xTitle;
            }
        }

        if (stream) {
            const streamStart = Date.now();
            const promptTokens = estimatePromptTokens(messages);
            const readableStream = new ReadableStream({
                async start(controller) {
                    try {
                        let completionContent = '';
                        const generator = providerImplementation.stream(
                            requestPayload,
                            apiKey,
                            baseUrl,
                            extraHeaders
                        );
                        for await (const chunk of generator) {
                            completionContent += chunk;
                            controller.enqueue(new TextEncoder().encode(chunk));
                        }

                        const completionTokens = Math.max(
                            1,
                            Math.round(completionContent.length / 4)
                        );
                        await safeRecordEvent({
                            event: 'llm_request',
                            userId,
                            payload: {
                                provider,
                                model: analyticsModel,
                                stream: true,
                                prompt_tokens: promptTokens,
                                completion_tokens: completionTokens,
                                total_tokens: promptTokens + completionTokens,
                                responseTime: Date.now() - streamStart,
                            },
                        });

                        controller.close();
                    } catch (error) {
                        await safeRecordEvent({
                            event: 'llm_error',
                            userId,
                            payload: {
                                provider,
                                model: analyticsModel,
                                stream: true,
                                responseTime: Date.now() - streamStart,
                                message: error instanceof Error ? error.message : 'stream_error',
                            },
                        });
                        const context = createErrorContext('/api/llm/chat', userId, { provider });
                        await errorManager.logError(error as Error, context);
                        controller.error(error);
                    }
                },
            });
            return new Response(readableStream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        } else {
            const requestStart = Date.now();
            const result = await providerImplementation.chat(requestPayload, apiKey, baseUrl, extraHeaders);

            const promptTokens = estimatePromptTokens(messages);
            const totalTokens = extractTotalTokens(result?.usage, promptTokens);
            const completionTokens = Math.max(0, totalTokens - promptTokens);

            await safeRecordEvent({
                event: 'llm_request',
                userId,
                payload: {
                    provider,
                    model: analyticsModel,
                    stream: false,
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                    total_tokens: totalTokens,
                    responseTime: Date.now() - requestStart,
                },
            });

            return NextResponse.json(result);
        }

    } catch (error) {
        if (analyticsUserId) {
            await safeRecordEvent({
                event: 'llm_error',
                userId: analyticsUserId,
                payload: {
                    provider: analyticsProvider,
                    model: analyticsModel,
                    message: error instanceof Error ? error.message : 'request_error',
                },
            });
        }
        const context = createErrorContext('/api/llm/chat');
        await errorManager.logError(error as Error, context);
        const mapped = mapErrorToResponse(error);
        return jsonErrorResponse(mapped.status, mapped.error, mapped.code);
    }
}
