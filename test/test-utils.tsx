import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from '@/components/theme-provider'
// import { QueryClient, QueryClientProvider } from '@tanstack/react-query' // Not used in current implementation
import { ErrorBoundary } from '@/components/error-boundary'
import type { ProviderConfig } from '@/lib/config-schemas'
import type { User } from 'next-auth'
import { vi } from 'vitest'

// Mock session data
export const mockSession = {
  user: {
    id: 'test-user-1',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
  } as User,
  expires: new Date(Date.now() + 2 * 86400).toISOString(),
}

export const mockAdminSession = {
  user: {
    id: 'admin-user-1',
    email: 'admin@example.com',
    name: 'Admin User',
    image: null,
  } as User,
  expires: new Date(Date.now() + 2 * 86400).toISOString(),
}

// Mock provider configurations
export const mockProviderConfigs: Record<string, ProviderConfig> = {
  openai: {
    apiKey: 'test-openai-key',
    models: ['gpt-4', 'gpt-3.5-turbo'],
    rateLimits: { requests: 60, window: 60000 },
    isActive: true,
  },
  anthropic: {
    apiKey: 'test-anthropic-key',
    models: ['claude-3-opus', 'claude-3-sonnet'],
    rateLimits: { requests: 50, window: 60000 },
    isActive: true,
  },
}

// Mock conversation data
export const mockConversations = [
  {
    id: 'conv-1',
    title: 'Test Conversation 1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    userId: 'test-user-1',
    messages: JSON.stringify([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]),
  },
  {
    id: 'conv-2',
    title: 'Test Conversation 2',
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    userId: 'test-user-1',
    messages: JSON.stringify([
      { role: 'user', content: 'How are you?' },
      { role: 'assistant', content: 'I am doing well, thank you!' },
    ]),
  },
]

// Mock personas
export const mockPersonas = [
  {
    id: 'persona-1',
    title: 'Helpful Assistant',
    description: 'A helpful and friendly assistant',
    prompt: 'You are a helpful assistant. Always be polite and informative.',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    userId: 'test-user-1',
  },
  {
    id: 'persona-2',
    title: 'Code Reviewer',
    description: 'An expert code reviewer',
    prompt: 'You are an expert code reviewer. Focus on code quality, performance, and best practices.',
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    userId: 'test-user-1',
  },
]

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  session?: any
  theme?: 'light' | 'dark' | 'system'
  withErrorBoundary?: boolean
  providers?: Record<string, ProviderConfig>
}

const AllTheProviders = ({ 
  children, 
  session, 
  theme = 'dark',
  withErrorBoundary = false,
}: { 
  children: React.ReactNode
  session?: any
  theme?: 'light' | 'dark' | 'system'
  withErrorBoundary?: boolean
}) => {
  let content = (
    <SessionProvider session={session}>
      <ThemeProvider
        attribute="class"
        defaultTheme={theme}
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </SessionProvider>
  )

  if (withErrorBoundary) {
    content = (
      <ErrorBoundary showErrorDetails={true}>
        {content}
      </ErrorBoundary>
    )
  }

  return content
}

export const customRender = (
  ui: ReactElement,
  {
    session = mockSession,
    theme = 'dark',
    withErrorBoundary = false,
    ...options
  }: CustomRenderOptions = {}
) =>
  render(ui, {
    wrapper: ({ children }) => (
      <AllTheProviders 
        session={session} 
        theme={theme}
        withErrorBoundary={withErrorBoundary}
      >
        {children}
      </AllTheProviders>
    ),
    ...options,
  })

// Mock API responses
export const mockApiResponses = {
  '/api/config/validate': {
    success: true,
    data: mockProviderConfigs.openai,
    connectionTest: { success: true, latency: 150 },
  },
  '/api/provider-configs': {
    configs: mockProviderConfigs,
  },
  '/api/personas': mockPersonas,
  '/api/conversations': mockConversations,
  '/api/analytics': {
    events: [],
    stats: { totalEvents: 0, totalTokens: 0, totalCost: 0 },
  },
}

// Mock fetch function
export const createMockFetch = (responses: Record<string, any> = mockApiResponses) => {
  return vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    const urlPath = url.replace(/^https?:\/\/[^\/]+/, '') // Remove domain
    
    if (responses[urlPath]) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => responses[urlPath],
        text: async () => JSON.stringify(responses[urlPath]),
      } as Response)
    }

    // Handle dynamic URLs with parameters
    for (const [pattern, response] of Object.entries(responses)) {
      if (urlPath.match(new RegExp(pattern.replace(/:\w+/g, '\\w+')))) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => response,
          text: async () => JSON.stringify(response),
        } as Response)
      }
    }

    return Promise.resolve({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
      text: async () => JSON.stringify({ error: 'Not found' }),
    } as Response)
  })
}

// Mock streaming responses
export const createMockStreamingResponse = (chunks: string[]) => {
  const encoder = new TextEncoder()
  
  return new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => {
        const data = { type: 'chunk', content: chunk }
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))
      })
      
      const done = { type: 'done' }
      controller.enqueue(encoder.encode(JSON.stringify(done) + '\n'))
      controller.close()
    }
  })
}

// Test helpers for async operations
// Sleep helper to avoid name clash with Testing Library's waitFor
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const waitForElement = async (getElement: () => Element | null, timeout = 5000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const element = getElement()
    if (element) return element
    await sleep(50)
  }
  throw new Error('Element not found within timeout')
}

// Mock window functions
export const mockWindow = {
  location: {
    href: 'http://localhost:3000',
    reload: vi.fn(),
  },
  navigator: {
    userAgent: 'test-user-agent',
  },
}

// Database mocking utilities
export const createMockPrisma = () => ({
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  conversation: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  providerConfig: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  persona: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  analytics: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
})

export * from '@testing-library/react'
export { customRender as render }