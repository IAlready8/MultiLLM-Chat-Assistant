# Python Integration

This project supports an optional Python sidecar service for orchestration-heavy LLM workflows.

## Overview
- Next.js app remains the primary web/API runtime.
- Python sidecar (FastAPI) handles orchestration workloads.
- Bridge route: `app/api/llm/orchestrate/route.ts`
- Sidecar is optional for core product operation.

## Default Service URL
- `PYTHON_CORE_URL` environment variable
- Default fallback: `http://127.0.0.1:8008`

## Request Flow
1. Client calls `/api/llm/orchestrate`.
2. Next.js validates/authenticates request (guest-enabled path).
3. Route proxies payload to Python service at `${PYTHON_CORE_URL}/api/v1/llm/orchestrate`.
4. If the sidecar responds successfully, response is returned to client.
5. If the sidecar is unavailable/unhealthy (5xx class), route falls back to local orchestration using `/api/llm/chat` per request and returns 200 with `x-orchestration-fallback: local`.

## Local Setup
### Node app
```bash
npm ci
npm run dev
```

### Python service
```bash
pip install -r requirements.txt
uvicorn src.core.main:app --host 127.0.0.1 --port 8008 --reload
```

Or run both with PM2 via `ecosystem.config.js`.

## Environment Variables
Common vars:
- `PYTHON_CORE_URL`
- Provider API keys required by your Python provider implementation

## Health and Troubleshooting
- If `/api/llm/orchestrate` returns `503`, verify sidecar host/port and availability.
- If it returns timeout behavior, check sidecar latency and network path.
- If sidecar fails but local fallback is possible, request may still succeed with `x-orchestration-fallback: local`.
- Validate service directly:
  - `GET http://127.0.0.1:8008/api/v1/health` (if enabled)

## Notes
- Orchestration is optional; core chat/config routes run without the Python sidecar.
- Keep sidecar dependency versions aligned with `requirements.txt`.

## Related
- `ARCHITECTURE.md`
- `README.md`
- `docs/DEPLOYMENT_GUIDE.md`
