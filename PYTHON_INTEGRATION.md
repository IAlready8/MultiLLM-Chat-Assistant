# Python Integration

This project supports an optional Python sidecar service for orchestration-heavy LLM workflows.

## Overview
- Next.js app remains the primary web/API runtime.
- Python sidecar (FastAPI) handles orchestration workloads.
- Bridge route: `app/api/llm/orchestrate/route.ts`

## Default Service URL
- `PYTHON_CORE_URL` environment variable
- Default fallback: `http://127.0.0.1:8008`

## Request Flow
1. Client calls `/api/llm/orchestrate`.
2. Next.js validates/authenticates request.
3. Route proxies payload to Python service at `${PYTHON_CORE_URL}/api/v1/llm/orchestrate`.
4. Python service returns structured orchestration results.

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
- If `/api/llm/orchestrate` returns `503`, verify the Python sidecar is running and reachable.
- If it returns timeout (`408`), check sidecar latency and network path.
- Validate service directly:
  - `GET http://127.0.0.1:8008/api/v1/health` (if enabled)

## Notes
- Orchestration is optional; core chat/config routes still run without the Python sidecar.
- Keep sidecar dependency versions aligned with `requirements.txt`.

## Related
- `ARCHITECTURE.md`
- `README.md`
- `docs/DEPLOYMENT_GUIDE.md`
