# Python Core Engine Integration

## Overview

The Personal LLM Tool integrates a Python-based core engine that handles LLM orchestration, caching, and performance optimization. This creates a hybrid architecture where Next.js handles the web interface and API routing, while Python manages the heavy lifting of LLM communications.

## Architecture

### Service Communication
- **Next.js App**: Runs on port 3000
- **Python Core**: Runs on port 8008 as a FastAPI service
- **Communication**: HTTP requests between services using fetch API

### Integration Points
1. **API Bridge**: `app/api/llm/orchestrate/route.ts` proxies requests to Python service
2. **Environment Variables**: Shared via `.env.local` for both services
3. **PM2 Process Manager**: Manages both services via `ecosystem.config.js`

## Python Core Components

### LLM Manager (`src/core/llm_manager.py`)
The central component that:
- Manages multiple LLM providers
- Implements request caching with LRU algorithm
- Tracks performance metrics
- Handles provider failover

### Provider Classes
- `OpenAIProvider`: Handles OpenAI API communication
- `AnthropicProvider`: Handles Anthropic API communication
- `GoogleProvider`: Handles Google Generative AI API communication

### FastAPI Service (`src/core/main.py`)
- Exposes REST endpoints for LLM operations
- Handles request/response serialization
- Manages service lifecycle

## Setup and Configuration

### 1. Install Python Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Ensure your `.env.local` contains the necessary API keys:
```bash
OPENAI_API_KEY="your-openai-api-key"
ANTHROPIC_API_KEY="your-anthropic-api-key"
GOOGLE_AI_API_KEY="your-google-ai-api-key"
```

### 3. Start Both Services
Using PM2 (recommended):
```bash
npm install -g pm2
pm2 start ecosystem.config.js
```

Or start individually:
```bash
# Terminal 1: Start Next.js
npm run dev

# Terminal 2: Start Python service
cd /path/to/project
source .venv/bin/activate  # if using virtual environment
uvicorn src.core.main:app --host 127.0.0.1 --port 8008 --reload
```

## API Endpoints

### Health Check
- **Endpoint**: `GET /api/v1/health`
- **Purpose**: Verify service status

### Single LLM Request
- **Endpoint**: `POST /api/v1/llm/chat`
- **Purpose**: Process single LLM request
- **Request**: `ProviderRequest` schema
- **Response**: `ProviderResponse` schema

### Multi-Provider Orchestration
- **Endpoint**: `POST /api/v1/llm/orchestrate`
- **Purpose**: Process multiple LLM requests in parallel
- **Request**: `MultiProviderRequest` schema
- **Response**: Array of `ProviderResponse` objects

## Caching Strategy

The Python core implements intelligent caching:
- **LRU Cache**: Limits cache size to prevent memory issues
- **Request Hashing**: Uses request parameters to create unique cache keys
- **Automatic Expiration**: Cached responses are fresh for subsequent identical requests

## Performance Optimization

### Concurrent Processing
- Requests to multiple providers are executed concurrently using asyncio
- Reduces total response time when querying multiple LLMs

### Connection Pooling
- HTTP clients maintain persistent connections to LLM providers
- Reduces overhead of establishing new connections

### Memory Management
- Configurable cache sizes to balance performance and memory usage
- Automatic cache cleanup to prevent memory leaks

## Error Handling

- Graceful degradation when providers are unavailable
- Detailed error reporting for debugging
- Provider failover when multiple providers are available

## Security Features

### Input Validation and Sanitization
- All user inputs (prompts, model names, parameters) are validated and sanitized
- Protection against injection attacks and malicious inputs
- Length limits and pattern validation for all inputs

### Secure Error Handling
- Sensitive information is scrubbed from error messages
- Internal system details are not exposed to clients
- Proper logging without exposing sensitive data

### Resource Management
- Proper cleanup of HTTP clients and connections
- Prevention of resource leaks
- Efficient memory usage with proper caching limits

### Information Disclosure Prevention
- Documentation endpoints disabled in production
- Security headers implemented
- Proper error message sanitization

## Testing

Python core includes comprehensive tests in `tests/test_llm_manager.py`:
- Unit tests for individual components
- Performance benchmarks
- Integration tests for end-to-end functionality

Run tests with:
```bash
pip install pytest pytest-asyncio
pytest tests/test_llm_manager.py -v
```

## Troubleshooting

### Common Issues
1. **Port Conflicts**: Ensure ports 3000 and 8008 are available
2. **API Keys**: Verify all required API keys are set in environment
3. **Network**: Confirm both services can communicate via localhost

### Debugging
- Check Python service logs for provider-specific errors
- Verify environment variables are accessible to both services
- Use the health check endpoint to verify service status

## Future Enhancements

- Add support for additional LLM providers
- Implement more sophisticated caching strategies
- Add request queuing for rate limit management
- Enhanced monitoring and alerting