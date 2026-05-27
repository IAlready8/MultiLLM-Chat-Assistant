import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserApiKey } from '@/lib/api-key-service';

/**
 * POST /api/providers/test
 *
 * Tests a provider's API key by making a minimal request.
 * Does NOT send user data - uses a simple "say hello" prompt.
 *
 * Request body: { provider: string }
 * Response: { success: boolean, provider: string, model: string, latencyMs: number, error?: string }
 */

// Minimal test configs per provider
const TEST_CONFIGS: Record<string, {
    url: string;
    buildRequest: (apiKey: string) => { headers: Record<string, string>; body: string };
    parseResponse: (data: any) => string;
}> = {
    openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        buildRequest: (apiKey) => ({
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: 'Say OK' }],
                max_tokens: 5,
                temperature: 0,
            }),
        }),
        parseResponse: (data) => data.choices?.[0]?.message?.content || 'OK',
    },

    anthropic: {
        url: 'https://api.anthropic.com/v1/messages',
        buildRequest: (apiKey) => ({
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                messages: [{ role: 'user', content: 'Say OK' }],
                max_tokens: 5,
                temperature: 0,
            }),
        }),
        parseResponse: (data) => data.content?.[0]?.text || 'OK',
    },

    googleai: {
        url: '', // Constructed dynamically with API key
        buildRequest: (apiKey) => ({
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }],
                generationConfig: { maxOutputTokens: 5, temperature: 0 },
            }),
        }),
        parseResponse: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text || 'OK',
    },

    grok: {
        url: 'https://api.x.ai/v1/chat/completions',
        buildRequest: (apiKey) => ({
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'grok-beta',
                messages: [{ role: 'user', content: 'Say OK' }],
                max_tokens: 5,
                temperature: 0,
            }),
        }),
        parseResponse: (data) => data.choices?.[0]?.message?.content || 'OK',
    },

    openrouter: {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        buildRequest: (apiKey) => ({
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://multillm.app',
                'X-Title': 'MultiLLM Chat',
            },
            body: JSON.stringify({
                model: 'openrouter/auto',
                messages: [{ role: 'user', content: 'Say OK' }],
                max_tokens: 5,
                temperature: 0,
            }),
        }),
        parseResponse: (data) => data.choices?.[0]?.message?.content || 'OK',
    },
};

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        const userId = session?.user?.id;
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { provider } = body;

        if (!provider || typeof provider !== 'string') {
            return NextResponse.json(
                { error: 'Provider is required' },
                { status: 400 }
            );
        }

        const testConfig = TEST_CONFIGS[provider];
        if (!testConfig) {
            return NextResponse.json(
                { error: `Provider '${provider}' is not supported for testing` },
                { status: 400 }
            );
        }

        // Get API key
        const apiKey = await getUserApiKey(userId, provider);
        if (!apiKey) {
            return NextResponse.json({
                success: false,
                provider,
                error: 'No API key configured for this provider',
            });
        }

        // Build request
        const { headers, body: requestBody } = testConfig.buildRequest(apiKey);

        // Special URL construction for Google AI (key in URL)
        let url = testConfig.url;
        if (provider === 'googleai') {
            url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        }

        // Execute test request
        const startTime = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: requestBody,
            signal: AbortSignal.timeout(15000),
        });
        const latencyMs = Date.now() - startTime;

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error?.message || errorData.error?.type || errorMessage;
            } catch {}

            return NextResponse.json({
                success: false,
                provider,
                latencyMs,
                error: errorMessage,
            });
        }

        const data = await response.json();
        const responseText = testConfig.parseResponse(data);

        return NextResponse.json({
            success: true,
            provider,
            latencyMs,
            response: responseText.slice(0, 50),
        });
    } catch (error: any) {
        const isTimeout = error.name === 'TimeoutError' || error.message?.includes('timeout');
        return NextResponse.json({
            success: false,
            provider: 'unknown',
            error: isTimeout ? 'Request timed out (15s)' : (error.message || 'Unknown error'),
        });
    }
}
