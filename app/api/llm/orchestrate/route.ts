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

      return NextResponse.json(
        {
          error: 'Python service error',
          details: errorData.detail || 'No details from service',
          status: pythonResponse.status,
        },
        { status: statusCode }
      );
    }

    const data = await pythonResponse.json();
    return NextResponse.json(data);

  } catch (error: any) {
    // Handle different types of errors
    if (error.name === 'AbortError') {
      console.error('Request to Python service timed out');
      return NextResponse.json(
        { error: 'Request to orchestration service timed out' },
        { status: 408 } // Request Timeout
      );
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('Network error connecting to Python service:', error.message);
      return NextResponse.json(
        { error: 'Unable to connect to orchestration service. Service may be down.' },
        { status: 503 } // Service Unavailable
      );
    } else {
      console.error('Unexpected error connecting to Python service:', error);
      return NextResponse.json(
        { error: 'Internal server error in orchestration service' },
        { status: 500 } // Internal Server Error
      );
    }
  }
}
