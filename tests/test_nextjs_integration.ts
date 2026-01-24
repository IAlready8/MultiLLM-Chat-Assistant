/**
 * Comprehensive tests for Next.js API integration with Python Core
 */

import { NextRequest } from 'next/server';
import { POST } from './route'; // Adjust import based on your actual file structure
import { getAuthenticatedUser } from '@/lib/api-auth';

// Mock the authentication function
jest.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: jest.fn(),
}));

// Mock the fetch API
global.fetch = jest.fn();

describe('Next.js API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Successful Requests', () => {
    it('should handle successful orchestration request', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock successful Python service response
      const mockPythonResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([
          {
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            content: 'Test response from OpenAI',
            prompt_tokens: 10,
            completion_tokens: 20,
            cost_usd: 0.001,
            latency_ms: 100
          },
          {
            provider: 'anthropic',
            model: 'claude-2',
            content: 'Test response from Anthropic',
            prompt_tokens: 15,
            completion_tokens: 25,
            cost_usd: 0.002,
            latency_ms: 150
          }
        ])
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockPythonResponse);

      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          requests: [
            {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              prompt: 'Test prompt for OpenAI'
            },
            {
              provider: 'anthropic',
              model: 'claude-2',
              prompt: 'Test prompt for Anthropic'
            }
          ],
          prompt: 'Test prompt'
        })
      } as unknown as NextRequest;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(responseData).toHaveLength(2);
      expect(responseData[0].provider).toBe('openai');
      expect(responseData[1].provider).toBe('anthropic');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8008/api/v1/llm/orchestrate',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for invalid JSON input', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock request with invalid JSON
      const mockRequest = {
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON'))
      } as unknown as NextRequest;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.error).toBe('Invalid JSON body');
    });

    it('should return 400 for invalid request schema', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock request with invalid schema
      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          invalid_field: 'invalid_value' // Missing required fields
        })
      } as unknown as NextRequest;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(400);
      expect(responseData.error).toBe('Invalid input');
    });

    it('should return 401 for unauthorized Python service response', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock Python service returning 401
      const mockPythonResponse = {
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({ detail: 'Invalid API key' })
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockPythonResponse);

      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          requests: [
            {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              prompt: 'Test prompt'
            }
          ],
          prompt: 'Test prompt'
        })
      } as unknown as NextRequest;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(401); // Should map 401 to 401
      expect(responseData.error).toBe('Python service error');
      expect(responseData.details).toBe('Invalid API key');
    });

    it('should return 429 for rate limit Python service response', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock Python service returning 429
      const mockPythonResponse = {
        ok: false,
        status: 429,
        json: jest.fn().mockResolvedValue({ detail: 'Rate limit exceeded' })
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockPythonResponse);

      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          requests: [
            {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              prompt: 'Test prompt'
            }
          ],
          prompt: 'Test prompt'
        })
      } as unknown as NextRequest;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(429); // Should map 429 to 429
      expect(responseData.error).toBe('Python service error');
      expect(responseData.details).toBe('Rate limit exceeded');
    });

    it('should return 502 for server error Python service response', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock Python service returning 500
      const mockPythonResponse = {
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({ detail: 'Internal server error' })
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockPythonResponse);

      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          requests: [
            {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              prompt: 'Test prompt'
            }
          ],
          prompt: 'Test prompt'
        })
      } as unknown as NextRequest;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(502); // Should map 500+ to 502
      expect(responseData.error).toBe('Python service error');
      expect(responseData.details).toBe('Internal server error');
    });

    it('should return 503 for network error', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock network error
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Network error'));

      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          requests: [
            {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              prompt: 'Test prompt'
            }
          ],
          prompt: 'Test prompt'
        })
      } as unknown as NextRequest;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(503);
      expect(responseData.error).toBe('Unable to connect to orchestration service. Service may be down.');
    });

    it('should return 408 for timeout error', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock timeout error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('AbortError'));

      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          requests: [
            {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              prompt: 'Test prompt'
            }
          ],
          prompt: 'Test prompt'
        })
      } as unknown as NextRequest;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(408);
      expect(responseData.error).toBe('Request to orchestration service timed out');
    });

    it('should handle non-JSON error response from Python service', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock Python service returning error with non-JSON body
      const mockPythonResponse = {
        ok: false,
        status: 500,
        json: jest.fn().mockRejectedValue(new Error('Not JSON')),
        text: jest.fn().mockResolvedValue('Internal Server Error')
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockPythonResponse);

      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          requests: [
            {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              prompt: 'Test prompt'
            }
          ],
          prompt: 'Test prompt'
        })
      } as unknown as NextRequest;

      const response = await POST(mockRequest);
      const responseData = await response.json();

      expect(response.status).toBe(502); // Should map 500+ to 502
      expect(responseData.error).toBe('Python service error');
      expect(responseData.details).toBe('Internal Server Error');
    });
  });

  describe('Authentication', () => {
    it('should return authentication error if user not authenticated', async () => {
      const mockAuthResponse = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      (getAuthenticatedUser as jest.Mock).mockResolvedValue(mockAuthResponse);

      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          requests: [
            {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              prompt: 'Test prompt'
            }
          ],
          prompt: 'Test prompt'
        })
      } as unknown as NextRequest;

      const response = await POST(mockRequest);

      expect(response.status).toBe(401);
      expect(global.fetch).not.toHaveBeenCalled(); // Should not call Python service
    });
  });

  describe('Environment Configuration', () => {
    it('should use PYTHON_CORE_URL from environment if available', async () => {
      // Set environment variable
      const originalEnv = process.env.PYTHON_CORE_URL;
      process.env.PYTHON_CORE_URL = 'http://custom-host:8008';

      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock successful Python service response
      const mockPythonResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue([])
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockPythonResponse);

      const mockRequest = {
        json: jest.fn().mockResolvedValue({
          requests: [
            {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              prompt: 'Test prompt'
            }
          ],
          prompt: 'Test prompt'
        })
      } as unknown as NextRequest;

      await POST(mockRequest);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://custom-host:8008/api/v1/llm/orchestrate', // Should use custom URL
        expect.any(Object)
      );

      // Restore original environment
      process.env.PYTHON_CORE_URL = originalEnv;
    });
  });
});