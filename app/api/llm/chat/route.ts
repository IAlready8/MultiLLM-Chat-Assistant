import { NextRequest, NextResponse } from 'next/server';
import { errorManager, createErrorContext, LLMProviderError, NotImplementedError } from '@/lib/error-system';
import { getUserApiKey, getUserProviderConfigs } from '@/lib/api-key-service';
import { getAuthenticatedUser } from '@/lib/api-auth'

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
        const errorBody = await response.json().catch(() => ({}));
        throw new LLMProviderError('grok', errorBody.error?.message || `HTTP ${response.status}`, createErrorContext('/api/llm/chat', request.userId, { streaming: false }));
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
        const errorBody = await response.json().catch(() => ({}));
        throw new LLMProviderError('grok', errorBody.error?.message || `HTTP ${response.status}`, createErrorContext('/api/llm/chat', request.userId, { streaming: true }));
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
        const errorBody = await response.json().catch(() => ({}));
        throw new LLMProviderError('anthropic', errorBody.error?.message || `HTTP ${response.status}`, createErrorContext('/api/llm/chat', request.userId, { streaming: false }));
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
        const errorBody = await response.json().catch(() => ({}));
        throw new LLMProviderError('anthropic', errorBody.error?.message || `HTTP ${response.status}`, createErrorContext('/api/llm/chat', request.userId, { streaming: true }));
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
        const errorBody = await response.json().catch(() => ({}));
        throw new LLMProviderError('googleai', errorBody.error?.message || `HTTP ${response.status}`, createErrorContext('/api/llm/chat', request.userId, { streaming: false }));
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
        const errorBody = await response.json().catch(() => ({}));
        throw new LLMProviderError('googleai', errorBody.error?.message || `HTTP ${response.status}`, createErrorContext('/api/llm/chat', request.userId, { streaming: true }));
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
        const errorBody = await response.json().catch(() => ({}));
        throw new LLMProviderError('openai', errorBody.error?.message || `HTTP ${response.status}`, createErrorContext('/api/llm/chat', request.userId, { streaming: false }));
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
        const errorBody = await response.json().catch(() => ({}));
        throw new LLMProviderError('openai', errorBody.error?.message || `HTTP ${response.status}`, createErrorContext('/api/llm/chat', request.userId, { streaming: true }));
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

// ===== Main POST Handler =====
export async function POST(req: NextRequest) {
    try {
        const authCheck = await getAuthenticatedUser({ allowGuest: true })
        if (authCheck instanceof NextResponse) return authCheck
        const { user } = authCheck
        const userId = user.id

        const body = await req.json();
        const { provider = 'openai', messages, model, temperature, max_tokens, stream = true } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return new NextResponse(JSON.stringify({ error: 'Messages are required' }), { status: 400 });
        }

        const providerImplementation = providerFactory[provider as keyof typeof providerFactory];
        if (!providerImplementation) {
            return new NextResponse(JSON.stringify({ error: `Provider '${provider}' not supported` }), { status: 400 });
        }

        const providerConfigs = await getUserProviderConfigs(userId);
        const providerConfig = providerConfigs.find(config => config.provider === provider);
        if (!providerConfig) {
            return new NextResponse(JSON.stringify({ error: `Provider ${provider} not configured` }), { status: 400 });
        }

        const apiKey = await getUserApiKey(userId, provider);
        if (!apiKey) {
            return new NextResponse(JSON.stringify({ error: `Failed to retrieve API key for ${provider}` }), { status: 500 });
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
            const readableStream = new ReadableStream({
                async start(controller) {
                    try {
                        const generator = providerImplementation.stream(
                            requestPayload,
                            apiKey,
                            baseUrl,
                            extraHeaders
                        );
                        for await (const chunk of generator) {
                            controller.enqueue(new TextEncoder().encode(chunk));
                        }
                        controller.close();
                    } catch (error) {
                        const context = createErrorContext('/api/llm/chat', userId, { provider });
                        await errorManager.logError(error as Error, context);
                        controller.error(error);
                    }
                },
            });
            return new Response(readableStream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        } else {
            const result = await providerImplementation.chat(requestPayload, apiKey, baseUrl, extraHeaders);
            return NextResponse.json(result);
        }

    } catch (error) {
        const context = createErrorContext('/api/llm/chat');
        await errorManager.logError(error as Error, context);
        const errorMessage = error instanceof Error ? error.message : 'An internal server error occurred';
        return new NextResponse(JSON.stringify({ error: errorMessage }), { status: 500 });
    }
}
