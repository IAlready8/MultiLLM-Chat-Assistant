/**
 * types/api.ts
 *
 * Canonical API contract types for the MultiLLM Chat Assistant.
 *
 * This file is the single source of truth for the shape of every request
 * body and response object across the API surface. It contains zero runtime
 * code - only TypeScript interfaces and type aliases.
 *
 * USAGE
 * -----
 * Import from this file in any component, hook, or service that constructs
 * or consumes API payloads. Do not define ad-hoc inline types for these shapes.
 *
 * API routes may independently validate incoming data with Zod, but the
 * inferred types from those schemas should align with the interfaces here.
 *
 * ORGANIZATION
 * ------------
 * Each API domain is grouped in a named section:
 *   - LLM (chat, stream, orchestrate, models)
 *   - Conversations
 *   - Goals
 *   - Personas
 *   - Provider configs
 *   - Auth
 *   - Analytics
 *   - Admin
 *   - Health
 *   - Billing
 *   - Errors (standard error envelope)
 */

// ---------------------------------------------------------------------------
// Standard error envelope
// All API error responses conform to this shape.
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string
  code: string
}

// ---------------------------------------------------------------------------
// LLM -Chat
// POST /api/llm/chat
// ---------------------------------------------------------------------------

export interface ChatRequest {
  provider: string
  messages: ApiMessage[]
  model?: string
  temperature?: number
  max_tokens?: number
  /** When true the client wants SSE streaming; when false a single JSON response. */
  stream?: boolean
}

export interface ChatResponse {
  content: string
  finish_reason: string
  usage?: TokenUsage
  provider: string
  model: string
}

export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

// ---------------------------------------------------------------------------
// LLM - Stream
// POST /api/llm/stream
// Returns NDJSON - one StreamChunkEvent per line.
// ---------------------------------------------------------------------------

export interface StreamRequest {
  provider: string
  messages: ApiMessage[]
  model?: string
  temperature?: number
  max_tokens?: number
}

/** Each line emitted from the NDJSON stream conforms to one of these shapes. */
export type StreamChunkEvent =
  | { type: 'chunk'; content: string }
  | { type: 'done' }
  | { type: 'error'; error: string }
  | { type: 'aborted' }

// ---------------------------------------------------------------------------
// LLM - Orchestrate
// POST /api/llm/orchestrate
// ---------------------------------------------------------------------------

export interface OrchestrateRequest {
  /** IDs of providers to fan the request out to. */
  providers: string[]
  messages: ApiMessage[]
  model?: string
  temperature?: number
  max_tokens?: number
  /** Strategy for combining results. Default is "parallel". */
  strategy?: 'parallel' | 'sequential' | 'race'
}

export interface OrchestrateResult {
  provider: string
  model: string
  content: string
  latencyMs: number
  error?: string
}

export interface OrchestrateResponse {
  results: OrchestrateResult[]
  totalMs: number
}

// ---------------------------------------------------------------------------
// LLM - Models
// GET /api/llm/models?provider=<id>
// ---------------------------------------------------------------------------

export interface ModelsRequest {
  /** Optional. If omitted, all providers are returned. */
  provider?: string
}

export interface ApiModelInfo {
  id: string
  displayName: string
  contextWindow: number
  isDefault: boolean
  isDeprecated?: boolean
  tag?: string
}

export interface ModelsResponse {
  provider?: string
  models?: ApiModelInfo[]
  /** Present when provider param is omitted - full catalog keyed by provider. */
  catalog?: Record<string, ApiModelInfo[]>
}

// ---------------------------------------------------------------------------
// Shared message type
// ---------------------------------------------------------------------------

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ---------------------------------------------------------------------------
// Conversations
// GET  /api/conversations
// POST /api/conversations
// GET  /api/conversations/[id]
// PUT  /api/conversations/[id]
// DELETE /api/conversations/[id]
// ---------------------------------------------------------------------------

export interface ConversationCreateRequest {
  title: string
}

export interface ConversationUpdateRequest {
  title?: string
}

export interface ApiConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  userId: string
  messages?: ApiConversationMessage[]
}

export interface ApiConversationMessage {
  id: string
  role: string
  content: string
  provider?: string | null
  model?: string | null
  createdAt: string
  conversationId: string
}

export interface ConversationListResponse {
  conversations: ApiConversation[]
}

// ---------------------------------------------------------------------------
// Goals
// GET  /api/goals
// POST /api/goals
// PUT  /api/goals/[id]
// DELETE /api/goals/[id]
// ---------------------------------------------------------------------------

export interface GoalCreateRequest {
  title: string
  description?: string
  status?: string
}

export interface GoalUpdateRequest {
  title?: string
  description?: string
  status?: string
}

export interface ApiGoal {
  id: string
  title: string
  description?: string | null
  status: string
  createdAt: string
  updatedAt: string
  userId: string
}

export interface GoalListResponse {
  goals: ApiGoal[]
}

// ---------------------------------------------------------------------------
// Personas
// GET  /api/personas
// POST /api/personas
// PUT  /api/personas/[id]
// DELETE /api/personas/[id]
// ---------------------------------------------------------------------------

export interface PersonaCreateRequest {
  title: string
  description?: string
  prompt: string
}

export interface PersonaUpdateRequest {
  title?: string
  description?: string
  prompt?: string
}

export interface ApiPersona {
  id: string
  title: string
  description?: string | null
  prompt: string
  createdAt: string
  updatedAt: string
  userId: string
}

export interface PersonaListResponse {
  personas: ApiPersona[]
}

// ---------------------------------------------------------------------------
// Provider Configs
// GET  /api/provider-configs
// POST /api/provider-configs
// ---------------------------------------------------------------------------

export interface ProviderConfigRequest {
  provider: string
  apiKey?: string
  settings?: Record<string, unknown>
  isActive?: boolean
}

export interface ApiProviderConfig {
  id: string
  provider: string
  isActive: boolean
  settings?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  userId: string
  /** API key is never returned in responses for security. */
}

export interface ProviderConfigListResponse {
  configs: ApiProviderConfig[]
}

// ---------------------------------------------------------------------------
// Auth
// POST /api/auth/upgrade-guest
// ---------------------------------------------------------------------------

export interface UpgradeGuestRequest {
  name?: string
  email: string
  password: string
}

export interface UpgradeGuestResponse {
  success: boolean
  message?: string
}

// ---------------------------------------------------------------------------
// Analytics
// GET /api/analytics
// POST /api/analytics
// ---------------------------------------------------------------------------

export interface AnalyticsEventRequest {
  event: string
  payload?: Record<string, unknown>
}

export interface ProviderUsageStat {
  provider: string
  requests: number
  tokens: number
  errors: number
  avgResponseTime: number
}

export interface ModelMetricStat {
  provider: string
  factualAccuracy: number
  creativity: number
  helpfulness: number
  coherence: number
  conciseness: number
}

export interface AnalyticsDashboardResponse {
  providerData: ProviderUsageStat[]
  modelMetrics: ModelMetricStat[]
  totalRequests: number
  totalTokens: number
  errorRate: number
  timeRange: string
}

// ---------------------------------------------------------------------------
// Health
// GET /api/health
// ---------------------------------------------------------------------------

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'

export interface HealthCheckDetail {
  status: HealthStatus
  message?: string
  latencyMs?: number
}

export interface HealthResponse {
  status: HealthStatus
  version?: string
  checks: {
    database: HealthCheckDetail
    auth: HealthCheckDetail
    stripe?: HealthCheckDetail
    sidecar?: HealthCheckDetail
  }
  uptime?: number
  timestamp: string
}

// ---------------------------------------------------------------------------
// Admin - Status
// GET /api/admin/status
// ---------------------------------------------------------------------------

export interface AdminStatusResponse {
  environment: string
  database: {
    connected: boolean
    migrationStatus?: string
  }
  providers: Array<{
    id: string
    configured: boolean
    active: boolean
  }>
  stripe: {
    configured: boolean
    webhookConfigured: boolean
  }
  sidecar: {
    configured: boolean
    reachable: boolean
  }
  timestamp: string
}

// ---------------------------------------------------------------------------
// Admin - Error Stats
// GET /api/admin/errors/stats
// ---------------------------------------------------------------------------

export interface ErrorStatEntry {
  code: string
  count: number
  lastSeen: string
  provider?: string
}

export interface AdminErrorStatsResponse {
  errors: ErrorStatEntry[]
  totalErrors: number
  window: string
}

// ---------------------------------------------------------------------------
// Billing / Subscriptions
// GET  /api/subscriptions
// POST /api/subscriptions/manage
// ---------------------------------------------------------------------------

export type SubscriptionTier = 'FREE' | 'PRO' | 'ENTERPRISE'

export interface ApiSubscription {
  id: string
  userId: string
  tier: SubscriptionTier
  stripeCurrentPeriodEnd?: string | null
}

export interface SubscriptionManageRequest {
  action: 'create-checkout' | 'create-portal' | 'cancel'
  priceId?: string
  returnUrl?: string
}

export interface SubscriptionManageResponse {
  url?: string
  success?: boolean
}

// ---------------------------------------------------------------------------
// Config
// GET /api/config
// ---------------------------------------------------------------------------

export interface PublicConfigResponse {
  authRequired: boolean
  supportedProviders: string[]
  features: {
    analytics: boolean
    goals: boolean
    personas: boolean
    billing: boolean
    comparison: boolean
    pipeline: boolean
    aiRoundtable: boolean
  }
}
