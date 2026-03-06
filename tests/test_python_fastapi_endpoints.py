"""
Tests for the Python FastAPI endpoints
"""

import pytest
import asyncio
import json
from unittest.mock import patch, AsyncMock
import httpx
from fastapi.testclient import TestClient

from src.core.main import app
from src.core.providers import llm_manager
from src.core.schemas import ProviderResponse
from src.core.llm_manager import InvalidAPIKeyError, RateLimitError


@pytest.fixture
def client():
    """Create a test client for the FastAPI app"""
    return TestClient(app)


class TestHealthEndpoint:
    """Test the health check endpoint"""

    def test_health_endpoint_success(self, client):
        """Test successful health check response"""
        # Mock the Redis connection test
        with patch('src.core.caching.test_redis_connection', new_callable=AsyncMock) as mock_redis:
            mock_redis.return_value = True
            
            # Mock the provider health check
            with patch.object(llm_manager, 'health_check') as mock_provider_health:
                mock_provider_health.return_value = {
                    "openai": True,
                    "anthropic": True,
                    "google": True
                }
                
                response = client.get("/api/v1/health")
                
                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "ok"
                assert "redis" in data["services"]
                assert data["services"]["redis"] == "ok"

    def test_health_endpoint_with_errors(self, client):
        """Test health check response with service errors"""
        # Mock the Redis connection test to return False
        with patch('src.core.caching.test_redis_connection', new_callable=AsyncMock) as mock_redis:
            mock_redis.return_value = False
            
            # Mock the provider health check
            with patch.object(llm_manager, 'health_check') as mock_provider_health:
                mock_provider_health.return_value = {
                    "openai": True,
                    "anthropic": False,  # This provider is unhealthy
                    "google": True
                }
                
                response = client.get("/api/v1/health")
                
                assert response.status_code == 200  # Health endpoint itself succeeds
                data = response.json()
                assert data["status"] == "error"  # But overall status is error
                assert data["services"]["redis"] == "error"
                assert data["services"]["anthropic_api"] == "error"

    def test_health_endpoint_exception(self, client):
        """Test health check response when an exception occurs"""
        # Mock the Redis connection test to raise an exception
        with patch('src.core.caching.test_redis_connection', new_callable=AsyncMock) as mock_redis:
            mock_redis.side_effect = Exception("Redis connection failed")
            
            response = client.get("/api/v1/health")
            
            assert response.status_code == 200  # Health endpoint handles exceptions
            data = response.json()
            assert data["status"] == "error"
            assert "Redis connection failed" in data["services"]["error"]


class TestChatEndpoint:
    """Test the chat endpoint"""

    @pytest.mark.asyncio
    async def test_chat_endpoint_success(self, client):
        """Test successful chat request"""
        # This test requires mocking the execute_llm_request function
        with patch('src.core.providers.execute_llm_request') as mock_execute:
            mock_response = {
                "provider": "openai",
                "model": "gpt-3.5-turbo",
                "content": "Test response",
                "prompt_tokens": 10,
                "completion_tokens": 20,
                "cost_usd": 0.001,
                "latency_ms": 100
            }
            mock_execute.return_value = mock_response
            
            request_data = {
                "provider": "openai",
                "model": "gpt-3.5-turbo",
                "prompt": "Test prompt",
                "max_tokens": 100,
                "temperature": 0.7
            }
            
            response = client.post("/api/v1/llm/chat", json=request_data)
            
            assert response.status_code == 200
            data = response.json()
            assert data["content"] == "Test response"
            assert data["provider"] == "openai"

    @pytest.mark.asyncio
    async def test_chat_endpoint_invalid_api_key(self, client):
        """Test chat request with invalid API key"""
        from src.core.llm_manager import InvalidAPIKeyError
        
        with patch('src.core.providers.execute_llm_request') as mock_execute:
            mock_execute.side_effect = InvalidAPIKeyError("Invalid API key")
            
            request_data = {
                "provider": "openai",
                "model": "gpt-3.5-turbo",
                "prompt": "Test prompt",
                "max_tokens": 100,
                "temperature": 0.7
            }
            
            response = client.post("/api/v1/llm/chat", json=request_data)
            
            assert response.status_code == 401  # Unauthorized
            data = response.json()
            assert "Invalid API key" in data["detail"]

    @pytest.mark.asyncio
    async def test_chat_endpoint_rate_limit(self, client):
        """Test chat request with rate limit error"""
        from src.core.llm_manager import RateLimitError
        
        with patch('src.core.providers.execute_llm_request') as mock_execute:
            mock_execute.side_effect = RateLimitError("Rate limit exceeded")
            
            request_data = {
                "provider": "openai",
                "model": "gpt-3.5-turbo",
                "prompt": "Test prompt",
                "max_tokens": 100,
                "temperature": 0.7
            }
            
            response = client.post("/api/v1/llm/chat", json=request_data)
            
            assert response.status_code == 429  # Too Many Requests
            data = response.json()
            assert "Rate limit exceeded" in data["detail"]

    @pytest.mark.asyncio
    async def test_chat_endpoint_connection_error(self, client):
        """Test chat request with connection error"""
        from src.core.llm_manager import APIConnectionError
        
        with patch('src.core.providers.execute_llm_request') as mock_execute:
            mock_execute.side_effect = APIConnectionError("Connection failed")
            
            request_data = {
                "provider": "openai",
                "model": "gpt-3.5-turbo",
                "prompt": "Test prompt",
                "max_tokens": 100,
                "temperature": 0.7
            }
            
            response = client.post("/api/v1/llm/chat", json=request_data)
            
            assert response.status_code == 502  # Bad Gateway
            data = response.json()
            assert "Connection failed" in data["detail"]

    @pytest.mark.asyncio
    async def test_chat_endpoint_general_error(self, client):
        """Test chat request with general error"""
        with patch('src.core.providers.execute_llm_request') as mock_execute:
            mock_execute.side_effect = Exception("General error")
            
            request_data = {
                "provider": "openai",
                "model": "gpt-3.5-turbo",
                "prompt": "Test prompt",
                "max_tokens": 100,
                "temperature": 0.7
            }
            
            response = client.post("/api/v1/llm/chat", json=request_data)
            
            assert response.status_code == 500  # Internal Server Error
            data = response.json()
            assert "Internal server error" in data["detail"]


class TestOrchestrateEndpoint:
    """Test the orchestrate endpoint"""

    @pytest.mark.asyncio
    async def test_orchestrate_endpoint_success(self, client):
        """Test successful orchestrate request"""
        with patch('src.core.providers.execute_llm_request') as mock_execute:
            # Mock successful responses for multiple providers
            def side_effect(request):
                return {
                    "provider": request.get("provider", "unknown"),
                    "model": request.get("model", "default-model"),
                    "content": f"Response from {request.get('provider', 'unknown')}",
                    "prompt_tokens": 10,
                    "completion_tokens": 20,
                    "cost_usd": 0.001,
                    "latency_ms": 100
                }
            
            mock_execute.side_effect = side_effect
            
            request_data = {
                "requests": [
                    {
                        "provider": "openai",
                        "model": "gpt-3.5-turbo",
                        "prompt": "Test prompt 1",
                        "max_tokens": 100,
                        "temperature": 0.7
                    },
                    {
                        "provider": "anthropic",
                        "model": "claude-2",
                        "prompt": "Test prompt 2",
                        "max_tokens": 100,
                        "temperature": 0.7
                    }
                ],
                "prompt": "Test prompt"
            }
            
            response = client.post("/api/v1/llm/orchestrate", json=request_data)
            
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2
            assert data[0]["provider"] == "openai"
            assert data[1]["provider"] == "anthropic"
            assert "Response from openai" in data[0]["content"]
            assert "Response from anthropic" in data[1]["content"]

    @pytest.mark.asyncio
    async def test_orchestrate_endpoint_with_some_errors(self, client):
        """Test orchestrate request with some successful and some failed requests"""
        from src.core.llm_manager import RateLimitError
        
        with patch('src.core.providers.execute_llm_request') as mock_execute:
            # Mock response: first succeeds, second fails with rate limit
            def side_effect(request):
                if request["provider"] == "openai":
                    return {
                        "provider": "openai",
                        "model": "gpt-3.5-turbo",
                        "content": "Response from OpenAI",
                        "prompt_tokens": 10,
                        "completion_tokens": 20,
                        "cost_usd": 0.001,
                        "latency_ms": 100
                    }
                elif request["provider"] == "anthropic":
                    raise RateLimitError("Rate limit exceeded for Anthropic")
                else:
                    return {
                        "provider": request["provider"],
                        "model": request["model"],
                        "content": f"Response from {request['provider']}",
                        "prompt_tokens": 5,
                        "completion_tokens": 10,
                        "cost_usd": 0.0005,
                        "latency_ms": 50
                    }
            
            mock_execute.side_effect = side_effect
            
            request_data = {
                "requests": [
                    {
                        "provider": "openai",
                        "model": "gpt-3.5-turbo",
                        "prompt": "Test prompt 1",
                        "max_tokens": 100,
                        "temperature": 0.7
                    },
                    {
                        "provider": "anthropic",
                        "model": "claude-2",
                        "prompt": "Test prompt 2",
                        "max_tokens": 100,
                        "temperature": 0.7
                    },
                    {
                        "provider": "google",
                        "model": "gemini-pro",
                        "prompt": "Test prompt 3",
                        "max_tokens": 100,
                        "temperature": 0.7
                    }
                ],
                "prompt": "Test prompt"
            }
            
            response = client.post("/api/v1/llm/orchestrate", json=request_data)
            
            assert response.status_code == 200  # Overall request succeeds
            data = response.json()
            assert len(data) == 3  # Same number of responses as requests
            
            # First should be successful
            assert data[0]["provider"] == "openai"
            assert "Response from OpenAI" in data[0]["content"]
            
            # Second should be an error response
            assert data[1]["provider"] == "anthropic"
            assert "Error processing request" in data[1]["content"]
            assert "Rate limit exceeded for Anthropic" in data[1]["content"]
            
            # Third should be successful
            assert data[2]["provider"] == "google"
            assert "Response from google" in data[2]["content"]

    @pytest.mark.asyncio
    async def test_orchestrate_endpoint_invalid_api_key(self, client):
        """Test orchestrate request with invalid API key error"""
        from src.core.llm_manager import InvalidAPIKeyError
        
        with patch('src.core.providers.execute_llm_request') as mock_execute:
            mock_execute.side_effect = InvalidAPIKeyError("Invalid API key")
            
            request_data = {
                "requests": [
                    {
                        "provider": "openai",
                        "model": "gpt-3.5-turbo",
                        "prompt": "Test prompt",
                        "max_tokens": 100,
                        "temperature": 0.7
                    }
                ],
                "prompt": "Test prompt"
            }
            
            response = client.post("/api/v1/llm/orchestrate", json=request_data)
            
            assert response.status_code == 401  # Unauthorized
            data = response.json()
            assert "Invalid API key" in data["detail"]

    @pytest.mark.asyncio
    async def test_orchestrate_endpoint_rate_limit(self, client):
        """Test orchestrate request with rate limit error"""
        from src.core.llm_manager import RateLimitError
        
        with patch('src.core.providers.execute_llm_request') as mock_execute:
            mock_execute.side_effect = RateLimitError("Rate limit exceeded")
            
            request_data = {
                "requests": [
                    {
                        "provider": "openai",
                        "model": "gpt-3.5-turbo",
                        "prompt": "Test prompt",
                        "max_tokens": 100,
                        "temperature": 0.7
                    }
                ],
                "prompt": "Test prompt"
            }
            
            response = client.post("/api/v1/llm/orchestrate", json=request_data)
            
            assert response.status_code == 429  # Too Many Requests
            data = response.json()
            assert "Rate limit exceeded" in data["detail"]

    @pytest.mark.asyncio
    async def test_orchestrate_endpoint_general_error(self, client):
        """Test orchestrate request with general error"""
        with patch('src.core.providers.execute_llm_request') as mock_execute:
            mock_execute.side_effect = Exception("General error")
            
            request_data = {
                "requests": [
                    {
                        "provider": "openai",
                        "model": "gpt-3.5-turbo",
                        "prompt": "Test prompt",
                        "max_tokens": 100,
                        "temperature": 0.7
                    }
                ],
                "prompt": "Test prompt"
            }
            
            response = client.post("/api/v1/llm/orchestrate", json=request_data)
            
            assert response.status_code == 500  # Internal Server Error
            data = response.json()
            assert "Internal server error" in data["detail"]


class TestStreamEndpoint:
    """Test the NDJSON stream endpoint."""

    @pytest.mark.asyncio
    async def test_stream_endpoint_success(self, client):
        with patch('src.core.main.execute_llm_request', new_callable=AsyncMock) as mock_execute:
            mock_execute.return_value = ProviderResponse(
                provider="openai",
                model="gpt-3.5-turbo",
                content="Streamed response",
                prompt_tokens=10,
                completion_tokens=20,
                cost_usd=0.001,
                latency_ms=100,
            )

            response = client.post(
                "/api/v1/llm/stream",
                json={
                    "provider": "openai",
                    "model": "gpt-3.5-turbo",
                    "messages": [{"role": "user", "content": "Test prompt"}],
                },
            )

            assert response.status_code == 200
            assert response.headers["content-type"].startswith("application/x-ndjson")
            lines = [json.loads(line) for line in response.text.strip().splitlines()]
            assert lines == [
                {"type": "chunk", "content": "Streamed response"},
                {"type": "done"},
            ]

    @pytest.mark.asyncio
    async def test_stream_endpoint_invalid_api_key_error(self, client):
        with patch('src.core.main.execute_llm_request', new_callable=AsyncMock) as mock_execute:
            mock_execute.side_effect = InvalidAPIKeyError("Invalid API key")

            response = client.post(
                "/api/v1/llm/stream",
                json={
                    "provider": "openai",
                    "model": "gpt-3.5-turbo",
                    "messages": [{"role": "user", "content": "Test prompt"}],
                },
            )

            assert response.status_code == 200
            lines = [json.loads(line) for line in response.text.strip().splitlines()]
            assert lines == [
                {
                    "type": "error",
                    "error": "Provider rejected the configured API key",
                    "code": "PROVIDER_AUTH_ERROR",
                }
            ]

    @pytest.mark.asyncio
    async def test_stream_endpoint_rate_limit_error(self, client):
        with patch('src.core.main.execute_llm_request', new_callable=AsyncMock) as mock_execute:
            mock_execute.side_effect = RateLimitError("Rate limit exceeded")

            response = client.post(
                "/api/v1/llm/stream",
                json={
                    "provider": "openai",
                    "model": "gpt-3.5-turbo",
                    "messages": [{"role": "user", "content": "Test prompt"}],
                },
            )

            assert response.status_code == 200
            lines = [json.loads(line) for line in response.text.strip().splitlines()]
            assert lines == [
                {
                    "type": "error",
                    "error": "Provider rate limit reached, please retry shortly",
                    "code": "RATE_LIMITED",
                }
            ]

    def test_stream_endpoint_validation_error(self, client):
        response = client.post(
            "/api/v1/llm/stream",
            json={
                "provider": "openai",
                "model": "gpt-3.5-turbo",
                "messages": [],
            },
        )

        assert response.status_code == 422
        assert response.json() == {
            "detail": "Invalid request parameters",
            "error": "validation_error",
        }


# Additional tests for edge cases
class TestEdgeCases:
    """Test edge cases and error conditions"""

    def test_health_endpoint_startup_failure(self, client):
        """Test health check when startup had failures"""
        # This simulates the scenario where provider initialization failed at startup
        with patch('src.core.providers.llm_manager') as mock_manager:
            mock_manager.health_check.side_effect = AttributeError("'NoneType' object has no attribute 'health_check'")
            
            response = client.get("/api/v1/health")
            
            assert response.status_code == 200  # Health endpoint should still respond
            data = response.json()
            assert data["status"] == "error"
            assert "AttributeError" in data["services"]["error"]
