from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
import asyncio
import structlog
from typing import List, Literal
import traceback
import re
import json

from .config import settings
from .caching import get_redis_client, test_redis_connection
from .schemas import (
    HealthResponse,
    MultiProviderRequest,
    ProviderRequest,
    ProviderResponse,
    ProviderStreamRequest,
)
from .providers import execute_llm_request, initialize_providers
from .llm_manager import InvalidAPIKeyError, RateLimitError, APIConnectionError
from .security_utils import scrub_sensitive_info

# --- Application Setup ---
app = FastAPI(
    title="RealMultiLLM Python Core",
    description="High-performance LLM orchestration sidecar.",
    version="0.1.0",
    # Add security headers
    docs_url=None,  # Disable docs in production
    redoc_url=None,  # Disable redoc in production
)

log = structlog.get_logger(__name__)


def _stream_event(payload: dict) -> str:
    return json.dumps(payload) + "\n"


def _messages_to_prompt(messages) -> str:
    return "\n".join(f"{message.role}: {message.content}" for message in messages)


def _looks_like_error_content(content: str) -> bool:
    lowered = content.lower()
    return lowered.startswith("error") or lowered.startswith("request validation error")


def _classify_stream_error(error: Exception) -> dict:
    message = scrub_sensitive_info(str(error))
    lower = message.lower()

    if isinstance(error, InvalidAPIKeyError) or "invalid api key" in lower or "http 401" in lower or "http 403" in lower:
        return {
            "code": "PROVIDER_AUTH_ERROR",
            "error": "Provider rejected the configured API key",
        }

    if isinstance(error, RateLimitError) or "rate limit" in lower or "http 429" in lower:
        return {
            "code": "RATE_LIMITED",
            "error": "Provider rate limit reached, please retry shortly",
        }

    if isinstance(error, APIConnectionError) or "timeout" in lower or "timed out" in lower or "abort" in lower:
        return {
            "code": "PROVIDER_TIMEOUT",
            "error": "Provider request timed out",
        }

    if "invalid json" in lower or "malformed" in lower or "unexpected response format" in lower:
        return {
            "code": "PROVIDER_MALFORMED_RESPONSE",
            "error": "Provider returned malformed response",
        }

    if "connection" in lower or "network" in lower or "fetch failed" in lower:
        return {
            "code": "NETWORK_ERROR",
            "error": "Failed to reach upstream provider",
        }

    return {
        "code": "INTERNAL_ERROR",
        "error": message or "Internal server error",
    }


# --- Security Middleware and Exception Handlers ---
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    """Handle validation errors securely"""
    log.warning(f"Validation error: {exc}")
    return JSONResponse(
        status_code=422,
        content={"detail": "Invalid request parameters", "error": "validation_error"},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle general exceptions securely"""
    log.error(f"Unhandled exception: {exc}", exc_info=True)
    # Don't expose internal error details to clients
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": "internal_error"},
    )

# --- Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Application State ---
@app.on_event("startup")
async def startup_event():
    """On startup, initialize providers and test external service connections."""
    log.info("Python Core service starting up...", env=settings.NODE_ENV)

    try:
        # Initialize LLM providers
        await initialize_providers()
        log.info("LLM providers initialized successfully")
    except Exception as e:
        log.error(f"Failed to initialize LLM providers: {str(e)}")
        traceback.print_exc()

    # Test external connections
    try:
        asyncio.create_task(test_redis_connection())
        log.info("Redis connection test initiated")
    except Exception as e:
        log.error(f"Failed to initiate Redis connection test: {str(e)}")


@app.on_event("shutdown")
async def shutdown_event():
    """On shutdown, clean up resources."""
    log.info("Python Core service shutting down.")
    # Clients will close automatically


# --- API Endpoints ---

@app.get("/api/v1/health", response_model=HealthResponse)
async def get_health():
    """
    Health check endpoint for PM2 and the Next.js app.
    """
    try:
        redis_status: Literal["ok", "error"] = "ok" if await test_redis_connection() else "error"

        # Perform actual provider health checks
        from .providers import llm_manager
        provider_health = llm_manager.health_check()

        services = {
            "redis": redis_status,
        }

        # Add provider health status
        for provider_type, is_healthy in provider_health.items():
            services[f"{provider_type}_api"] = "ok" if is_healthy else "error"

        overall_status: Literal["ok", "error"] = "ok" if "error" not in services.values() else "error"

        return HealthResponse(status=overall_status, services=services)
    except Exception as e:
        log.error(f"Health check failed: {str(e)}")
        return HealthResponse(status="error", services={"error": str(e)})


@app.post("/api/v1/llm/chat", response_model=ProviderResponse)
async def post_chat(request: ProviderRequest):
    """
    Processes a single, non-streaming LLM request.
    Caches the response.
    """
    log.info("Received chat request", provider=request.provider, model=request.model)

    try:
        # TODO: Add Redis caching layer here
        response = await execute_llm_request(request)
        return response
    except InvalidAPIKeyError as e:
        log.error(f"Invalid API key error: {str(e)}")
        raise HTTPException(status_code=401, detail=str(e))
    except RateLimitError as e:
        log.warning(f"Rate limit error: {str(e)}")
        raise HTTPException(status_code=429, detail=str(e))
    except APIConnectionError as e:
        log.error(f"API connection error: {str(e)}")
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        log.error(f"Unexpected error in chat endpoint: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/api/v1/llm/orchestrate", response_model=List[ProviderResponse])
async def post_orchestrate(request: MultiProviderRequest):
    """
    Processes multiple LLM requests in parallel.
    """
    log.info("Received orchestration request", models=len(request.requests))

    try:
        # Run all requests concurrently
        tasks = [execute_llm_request(req) for req in request.requests]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Check for exceptions in results
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                log.error(f"Error in orchestration task {i}: {str(result)}")
                # Create an error response
                processed_results.append(ProviderResponse(
                    provider=getattr(request.requests[i], 'provider', 'unknown'),
                    model=getattr(request.requests[i], 'model', ''),
                    content=f"Error processing request: {str(result)}",
                    prompt_tokens=0,
                    completion_tokens=0,
                    cost_usd=0.0,
                    latency_ms=0
                ))
            else:
                processed_results.append(result)

        return processed_results
    except InvalidAPIKeyError as e:
        log.error(f"Invalid API key error in orchestration: {str(e)}")
        raise HTTPException(status_code=401, detail=str(e))
    except RateLimitError as e:
        log.warning(f"Rate limit error in orchestration: {str(e)}")
        raise HTTPException(status_code=429, detail=str(e))
    except APIConnectionError as e:
        log.error(f"API connection error in orchestration: {str(e)}")
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        log.error(f"Unexpected error in orchestration endpoint: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/api/v1/llm/stream")
async def post_stream(request: ProviderStreamRequest):
    """
    Stream a single provider response using the same NDJSON event shape as the
    Next.js route (`chunk`, `done`, `error`).
    """

    log.info("Received stream request", provider=request.provider, model=request.model)

    async def event_generator():
        try:
            provider_request = ProviderRequest(
                provider=request.provider,
                model=request.model,
                prompt=_messages_to_prompt(request.messages),
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
            response = await execute_llm_request(provider_request)

            if _looks_like_error_content(response.content):
                error_payload = _classify_stream_error(Exception(response.content))
                yield _stream_event(
                    {
                        "type": "error",
                        "error": error_payload["error"],
                        "code": error_payload["code"],
                    }
                )
                return

            if response.content:
                yield _stream_event({"type": "chunk", "content": response.content})
            yield _stream_event({"type": "done"})
        except Exception as exc:
            error_payload = _classify_stream_error(exc)
            yield _stream_event(
                {
                    "type": "error",
                    "error": error_payload["error"],
                    "code": error_payload["code"],
                }
            )

    return StreamingResponse(
        event_generator(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache"},
    )
