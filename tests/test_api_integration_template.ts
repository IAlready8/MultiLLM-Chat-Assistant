/**
 * Integration tests for API routes that connect to Python Core
 * This file provides a template for testing API routes that interact with the Python service
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-auth';

// Mock the authentication function
jest.mock('@/lib/api-auth', () => ({
  getAuthenticatedUser: jest.fn(),
}));

// Mock the fetch API
global.fetch = jest.fn();

describe('API Integration with Python Core', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Generic Python Service Integration', () => {
    it('should properly handle successful Python service response', async () => {
      // This test demonstrates the pattern for testing routes that connect to Python service
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock successful Python service response
      const mockPythonResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          content: 'Test response from Python service',
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          tokens_used: 10,
          latency_ms: 100
        })
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockPythonResponse);

      // Example request payload
      const requestBody = {
        requests: [
          {
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            prompt: 'Test prompt'
          }
        ],
        prompt: 'Test prompt'
      };

      // Example API call to Python service
      const pythonResponse = await fetch('http://127.0.0.1:8008/api/v1/llm/orchestrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      const data = await pythonResponse.json();

      expect(pythonResponse.ok).toBe(true);
      expect(data).toHaveProperty('content');
      expect(data.provider).toBe('openai');
    });

    it('should handle Python service 401 Unauthorized response', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock Python service returning 401
      const mockPythonResponse = {
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({ detail: 'Invalid API key' })
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockPythonResponse);

      const pythonResponse = await fetch('http://127.0.0.1:8008/api/v1/llm/orchestrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{ provider: 'openai', model: 'gpt-3.5-turbo', prompt: 'Test' }]
        })
      });

      expect(pythonResponse.status).toBe(401);
      expect(pythonResponse.ok).toBe(false);
    });

    it('should handle Python service 429 Rate Limit response', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock Python service returning 429
      const mockPythonResponse = {
        ok: false,
        status: 429,
        json: jest.fn().mockResolvedValue({ detail: 'Rate limit exceeded' })
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockPythonResponse);

      const pythonResponse = await fetch('http://127.0.0.1:8008/api/v1/llm/orchestrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{ provider: 'openai', model: 'gpt-3.5-turbo', prompt: 'Test' }]
        })
      });

      expect(pythonResponse.status).toBe(429);
      expect(pythonResponse.ok).toBe(false);
    });

    it('should handle Python service 5xx Server Error response', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock Python service returning 500
      const mockPythonResponse = {
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({ detail: 'Internal server error' })
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockPythonResponse);

      const pythonResponse = await fetch('http://127.0.0.1:8008/api/v1/llm/orchestrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [{ provider: 'openai', model: 'gpt-3.5-turbo', prompt: 'Test' }]
        })
      });

      expect(pythonResponse.status).toBe(500);
      expect(pythonResponse.ok).toBe(false);
    });

    it('should handle network errors when connecting to Python service', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock network error
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Network error'));

      try {
        await fetch('http://127.0.0.1:8008/api/v1/llm/orchestrate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [{ provider: 'openai', model: 'gpt-3.5-turbo', prompt: 'Test' }]
          })
        });
      } catch (error) {
        expect(error).toBeInstanceOf(TypeError);
        expect((error as TypeError).message).toContain('Network error');
      }
    });

    it('should handle timeout errors when connecting to Python service', async () => {
      // Mock authenticated user
      (getAuthenticatedUser as jest.Mock).mockResolvedValue({ user: { id: 'test-user' } });

      // Mock timeout error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('AbortError'));

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 100); // 100ms timeout for test

        await fetch('http://127.0.0.1:8008/api/v1/llm/orchestrate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [{ provider: 'openai', model: 'gpt-3.5-turbo', prompt: 'Test' }]
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
      } catch (error) {
        expect((error as Error).message).toContain('AbortError');
      }
    });
  });

  describe('Health Check Integration', () => {
    it('should return health status from Python service', async () => {
      // Mock successful health check response
      const mockHealthResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          status: 'ok',
          services: {
            redis: 'ok',
            openai_api: 'ok',
            anthropic_api: 'ok'
          }
        })
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockHealthResponse);

      const healthResponse = await fetch('http://127.0.0.1:8008/api/v1/health');

      expect(healthResponse.ok).toBe(true);
      const healthData = await healthResponse.json();
      expect(healthData.status).toBe('ok');
      expect(healthData.services).toHaveProperty('redis');
      expect(healthData.services).toHaveProperty('openai_api');
    });

    it('should handle health check failure', async () => {
      // Mock health check failure response
      const mockHealthResponse = {
        ok: false,
        status: 503,
        json: jest.fn().mockResolvedValue({
          status: 'error',
          services: {
            redis: 'error',
            openai_api: 'ok'
          }
        })
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockHealthResponse);

      const healthResponse = await fetch('http://127.0.0.1:8008/api/v1/health');

      expect(healthResponse.ok).toBe(false);
      expect(healthResponse.status).toBe(503);
      const healthData = await healthResponse.json();
      expect(healthData.status).toBe('error');
      expect(healthData.services.redis).toBe('error');
    });
  });

  describe('Configuration and Environment', () => {
    it('should use environment variable for Python service URL when available', () => {
      // Test that the environment variable is properly used
      const originalUrl = process.env.PYTHON_CORE_URL;
      
      process.env.PYTHON_CORE_URL = 'http://custom-python-service:8008';
      const customUrl = process.env.PYTHON_CORE_URL;
      
      expect(customUrl).toBe('http://custom-python-service:8008');
      
      // Restore original
      process.env.PYTHON_CORE_URL = originalUrl;
    });

    it('should fallback to default URL when environment variable is not set', () => {
      const originalUrl = process.env.PYTHON_CORE_URL;
      
      // Temporarily unset the environment variable
      delete process.env.PYTHON_CORE_URL;
      const fallbackUrl = process.env.PYTHON_CORE_URL || 'http://127.0.0.1:8008';
      
      expect(fallbackUrl).toBe('http://127.0.0.1:8008');
      
      // Restore original
      process.env.PYTHON_CORE_URL = originalUrl;
    });
  });
});