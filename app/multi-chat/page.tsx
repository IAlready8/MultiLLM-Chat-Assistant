'use client'

/**
 * Multi-Chat Page - The primary chat interface.
 *
 * FEATURES INTEGRATED:
 * 1. Conversation History Sidebar (browse, search, delete, new)
 * 2. Markdown Rendering for AI responses (code blocks, tables, links)
 * 3. Persona Selector (inject system prompt from saved personas)
 * 4. Multi-model simultaneous chat with streaming
 * 5. Token usage display per assistant message
 *
 * DEPENDENCIES:
 *   npm install react-markdown remark-gfm
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Send,
  Bot,
  User,
  RotateCcw,
  Settings,
  Plus,
  X,
  UserCircle,
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { apiClient } from '@/lib/api-client'
import Link from 'next/link'
import { ErrorBoundary } from '@/components/error-boundary'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { ConversationSidebar } from '@/components/conversation-sidebar'

// ---- Constants ----
const SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'googleai', 'openrouter', 'grok'] as const

const AVAILABLE_MODELS: Record<string, string[]> = {
  openai: ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-3-opus-20240229',
  ],
  googleai: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'],
  openrouter: [
    'openrouter/auto',
    'openai/gpt-4',
    'anthropic/claude-3-opus',
    'google/gemini-pro',
  ],
  grok: ['grok-beta', 'grok-2-1212'],
}

const COST_PER_1K: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-pro': { input: 0.000125, output: 0.000375 },
  'grok-beta': { input: 0.005, output: 0.015 },
  'grok-2-1212': { input: 0.002, output: 0.01 },
}

// ---- Types ----
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  provider?: string
  model?: string
  instanceId?: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  costUsd?: number
  latencyMs?: number
}

interface ModelInstance {
  id: string
  provider: string
  model: string
}

interface PersonaMeta {
  id: string
  title: string
  description: string | null
  prompt: string
}

interface ChatState {
  messages: Message[]
  input: string
  isLoading: boolean
  activeInstances: ModelInstance[]
}

// ---- Helper: generate unique ID ----
const generateInstanceId = () =>
  `instance-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

const estimateTokenCount = (content: string) =>
  Math.max(1, Math.round(content.length / 4))

const estimatePromptTokens = (
  messages: Array<{ role: string; content: string }>
) =>
  Math.max(
    1,
    messages.reduce((total, message) => total + estimateTokenCount(message.content), 0)
  )

const estimateCostUsd = (
  model: string,
  promptTokens: number,
  completionTokens: number
) => {
  const pricing =
    COST_PER_1K[model] ??
    Object.entries(COST_PER_1K).find(([key]) => model.startsWith(key))?.[1]

  if (!pricing) return 0
  const cost =
    (promptTokens / 1000) * pricing.input +
    (completionTokens / 1000) * pricing.output
  return Math.round(cost * 100000) / 100000
}

interface StreamUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
  latencyMs: number
}

// ---- Main Content Component ----
function MultiChatPageContent() {
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    input: '',
    isLoading: false,
    activeInstances: [
      { id: 'default-openai', provider: 'openai', model: 'gpt-4' },
    ],
  })

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)

  // Persona state
  const [personas, setPersonas] = useState<PersonaMeta[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null)

  const { toast } = useToast()
  const { status } = useSession()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isBusy = chatState.isLoading || isLoadingHistory
  const hasMessages = chatState.messages.length > 0

  // ---- Load configured providers ----
  const loadConfiguredProviders = useCallback(async () => {
    try {
      const response = await fetch('/api/config', { cache: 'no-store' })
      if (!response.ok) return

      const data = await response.json()
      const configured = Array.isArray(data?.configuredProviders)
        ? data.configuredProviders
        : []
      const filtered = configured.filter((provider: string) =>
        SUPPORTED_PROVIDERS.includes(
          provider as (typeof SUPPORTED_PROVIDERS)[number]
        )
      )

      if (filtered.length > 0) {
        const instances: ModelInstance[] = filtered.map((provider: string) => ({
          id: generateInstanceId(),
          provider,
          model: AVAILABLE_MODELS[provider]?.[0] || '',
        }))
        setChatState((prev) => ({ ...prev, activeInstances: instances }))
      }
    } catch (error) {
      console.error('Failed to load configured providers:', error)
    }
  }, [])

  // ---- Load personas ----
  const loadPersonas = useCallback(async () => {
    try {
      const response = await fetch('/api/personas', { cache: 'no-store' })
      if (!response.ok) return
      const data: PersonaMeta[] = await response.json()
      setPersonas(data)
    } catch (error) {
      console.error('Failed to load personas:', error)
    }
  }, [])

  // ---- Load a specific conversation ----
  const loadConversation = useCallback(
    async (conversationId: string) => {
      try {
        setIsLoadingHistory(true)
        const conversation = await apiClient.getConversation(conversationId)
        setActiveConversationId(conversation.id)

        const restoredMessages: Message[] = conversation.messages.map(
          (msg: any) => ({
            id: msg.id,
            role: msg.role as Message['role'],
            content: msg.content,
            timestamp: new Date(msg.createdAt),
            provider: msg.provider ?? undefined,
            model: msg.model ?? undefined,
            promptTokens: msg.promptTokens ?? undefined,
            completionTokens: msg.completionTokens ?? undefined,
            totalTokens: msg.totalTokens ?? undefined,
            costUsd: msg.costUsd ?? undefined,
            latencyMs: msg.latencyMs ?? undefined,
          })
        )

        setChatState((prev) => ({
          ...prev,
          messages: restoredMessages,
        }))
      } catch (error) {
        console.error('Failed to load conversation:', error)
        toast({
          title: 'Error',
          description: 'Failed to load conversation.',
          variant: 'destructive',
        })
      } finally {
        setIsLoadingHistory(false)
      }
    },
    [toast]
  )

  // ---- Load latest conversation on mount ----
  const loadLatestConversation = useCallback(async () => {
    try {
      setIsLoadingHistory(true)
      const conversations = await apiClient.getConversations()
      if (conversations.length === 0) return

      const latest = conversations[0]
      await loadConversation(latest.id)
    } catch (error) {
      console.error('Failed to load conversation history:', error)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [loadConversation])

  // ---- Initial load ----
  useEffect(() => {
    if (status !== 'authenticated') {
      if (status === 'unauthenticated') {
        setIsLoadingHistory(false)
      }
      return
    }

    const load = async () => {
      await loadConfiguredProviders()
      await loadPersonas()
      await loadLatestConversation()
    }
    void load()
  }, [loadConfiguredProviders, loadPersonas, loadLatestConversation, status])

  // ---- Auto-scroll ----
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatState.messages])

  // ---- Input handler ----
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChatState((prev) => ({ ...prev, input: e.target.value }))
  }

  // ---- Derive conversation title from first message ----
  const deriveConversationTitle = (content: string) => {
    const trimmed = content.trim().replace(/\s+/g, ' ')
    if (!trimmed) return 'New Conversation'
    const maxLength = 60
    const base = trimmed.slice(0, maxLength)
    return trimmed.length > maxLength ? `${base}...` : base
  }

  // ---- Ensure conversation exists in DB ----
  const ensureConversation = async (userContent: string) => {
    const userMessage = {
      role: 'user' as const,
      content: userContent,
      provider: null,
      model: null,
    }

    try {
      if (activeConversationId) {
        await apiClient.addMessages(activeConversationId, [userMessage])
        return activeConversationId
      }

      const title = deriveConversationTitle(userContent)
      const newConversation = await apiClient.createConversation({
        title,
        messages: [userMessage],
      })
      setActiveConversationId(newConversation.id)
      return newConversation.id
    } catch (error) {
      console.error('Failed to save user message:', error)
      toast({
        title: 'Error',
        description: 'Failed to save your message.',
        variant: 'destructive',
      })
      return null
    }
  }

  // ---- Persist assistant message with token data ----
  const persistAssistantMessage = async (
    conversationId: string,
    provider: string,
    model: string | undefined,
    content: string,
    usage?: Partial<StreamUsage>
  ) => {
    const message: any = {
      role: 'assistant' as const,
      content,
      provider,
      model: model ?? null,
      promptTokens: usage?.promptTokens ?? null,
      completionTokens: usage?.completionTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
      costUsd: usage?.costUsd ?? null,
      latencyMs: usage?.latencyMs ?? null,
    }

    try {
      await apiClient.addMessages(conversationId, [message])
    } catch (error) {
      console.error('Failed to save assistant message:', error)
    }
  }

  // ---- Build messages array with persona system prompt ----
  const buildMessagesForProvider = (
    messageHistory: Message[]
  ): Array<{ role: string; content: string }> => {
    const selectedPersona = personas.find((p) => p.id === selectedPersonaId)
    const messagesForApi: Array<{ role: string; content: string }> = []

    // Inject system prompt from persona if selected
    if (selectedPersona?.prompt) {
      messagesForApi.push({
        role: 'system',
        content: selectedPersona.prompt,
      })
    }

    // Add conversation messages (skip any existing system messages to avoid duplication)
    for (const msg of messageHistory) {
      if (msg.role === 'system') continue
      messagesForApi.push({
        role: msg.role,
        content: msg.content,
      })
    }

    return messagesForApi
  }

  // ---- Stream provider response ----
  const streamProviderResponse = async (
    provider: string,
    messages: Array<{ role: string; content: string }>,
    model: string,
    onChunk: (chunk: string) => void
  ): Promise<{ content: string; usage: StreamUsage }> => {
    const startedAt = Date.now()
    const response = await fetch('/api/llm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, messages, model, stream: true }),
    })

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`
      try {
        const errorBody = await response.json()
        errorMessage = errorBody?.error || errorMessage
      } catch {}
      throw new Error(errorMessage)
    }

    if (!response.body) {
      throw new Error('No response body received')
    }

    const promptTokens = estimatePromptTokens(messages)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (chunk) {
          fullContent += chunk
          onChunk(chunk)
        }
      }
      const finalChunk = decoder.decode()
      if (finalChunk) {
        fullContent += finalChunk
        onChunk(finalChunk)
      }
    } finally {
      reader.releaseLock()
    }

    const completionTokens = estimateTokenCount(fullContent)
    return {
      content: fullContent,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        costUsd: estimateCostUsd(model, promptTokens, completionTokens),
        latencyMs: Date.now() - startedAt,
      },
    }
  }

  // ---- Submit handler ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatState.input.trim() || chatState.isLoading || isLoadingHistory) return
    if (chatState.activeInstances.length === 0) {
      toast({
        title: 'No Models Enabled',
        description: 'Add at least one model before sending a message.',
        variant: 'destructive',
      })
      return
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: chatState.input,
      timestamp: new Date(),
    }

    const typingIds: Record<string, string> = {}
    const initialAssistantMessages = chatState.activeInstances.map(
      (instance) => {
        const id = `typing-${instance.id}-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2, 8)}`
        typingIds[instance.id] = id
        return {
          id,
          role: 'assistant' as const,
          content: 'Thinking...',
          timestamp: new Date(),
          provider: instance.provider,
          model: instance.model,
          instanceId: instance.id,
        }
      }
    )

    const messageHistory = chatState.messages.concat(userMessage)

    setChatState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage, ...initialAssistantMessages],
      input: '',
      isLoading: true,
    }))

    const conversationId = await ensureConversation(userMessage.content)
    if (!conversationId) {
      setChatState((prev) => ({
        ...prev,
        isLoading: false,
        messages: prev.messages.filter(
          (msg) => !msg.id.startsWith('typing-')
        ),
      }))
      return
    }

    const instancePromises = chatState.activeInstances.map((instance) => {
      const typingId = typingIds[instance.id]
      if (!typingId) return Promise.resolve()
      return callInstance(instance, messageHistory, conversationId, typingId)
    })

    try {
      await Promise.all(instancePromises)
    } catch (error) {
      console.error('Error calling providers:', error)
      toast({
        title: 'Error',
        description: 'Failed to get responses from providers',
        variant: 'destructive',
      })
    } finally {
      setChatState((prev) => ({ ...prev, isLoading: false }))
    }
  }

  // ---- Call a single model instance ----
  const callInstance = async (
    instance: ModelInstance,
    messages: Message[],
    conversationId: string,
    typingId: string
  ) => {
    try {
      const { provider, model } = instance
      if (!model) {
        throw new Error('No model selected for instance')
      }

      const fullMessages = buildMessagesForProvider(messages)

      const result = await streamProviderResponse(
        provider,
        fullMessages,
        model,
        (chunk) => {
          setChatState((prev) => {
            const updatedMessages = prev.messages.map((msg) => {
              if (msg.id === typingId) {
                return {
                  ...msg,
                  content:
                    msg.content === 'Thinking...'
                      ? chunk
                      : msg.content + chunk,
                }
              }
              return msg
            })
            return { ...prev, messages: updatedMessages }
          })
        }
      )

      if (result.content.trim()) {
        setChatState((prev) => ({
          ...prev,
          messages: prev.messages.map((msg) =>
            msg.id === typingId
              ? {
                  ...msg,
                  promptTokens: result.usage.promptTokens,
                  completionTokens: result.usage.completionTokens,
                  totalTokens: result.usage.totalTokens,
                  costUsd: result.usage.costUsd,
                  latencyMs: result.usage.latencyMs,
                }
              : msg
          ),
        }))

        await persistAssistantMessage(
          conversationId,
          provider,
          model,
          result.content.trim(),
          result.usage
        )
      }
    } catch (error) {
      console.error(
        `Error calling instance ${instance.provider}/${instance.model}:`,
        error
      )

      setChatState((prev) => {
        const updatedMessages = prev.messages.map((msg) => {
          if (msg.id === typingId) {
            return {
              ...msg,
              content: `Error: ${
                (error as Error).message || 'Failed to get response'
              }`,
              timestamp: new Date(),
            }
          }
          return msg
        })
        return { ...prev, messages: updatedMessages }
      })

      toast({
        title: 'Provider Error',
        description: `Failed to get response from ${instance.provider}/${instance.model}: ${
          (error as Error).message || 'Unknown error'
        }`,
        variant: 'destructive',
      })
    }
  }

  // ---- Clear / New conversation ----
  const clearChat = () => {
    setActiveConversationId(null)
    setChatState((prev) => ({
      ...prev,
      messages: [],
      input: '',
      isLoading: false,
    }))
  }

  // ---- Delete conversation ----
  const handleDeleteConversation = async (id: string) => {
    try {
      await apiClient.deleteConversation(id)
      if (activeConversationId === id) {
        clearChat()
      }
      toast({ title: 'Deleted', description: 'Conversation deleted.' })
    } catch (error) {
      console.error('Failed to delete conversation:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete conversation.',
        variant: 'destructive',
      })
    }
  }

  // ---- Model instance management ----
  const addModelInstance = (provider: string) => {
    const newInstance: ModelInstance = {
      id: generateInstanceId(),
      provider,
      model: AVAILABLE_MODELS[provider]?.[0] || '',
    }
    setChatState((prev) => ({
      ...prev,
      activeInstances: [...prev.activeInstances, newInstance],
    }))
  }

  const removeModelInstance = (instanceId: string) => {
    setChatState((prev) => ({
      ...prev,
      activeInstances: prev.activeInstances.filter(
        (inst) => inst.id !== instanceId
      ),
    }))
  }

  const updateInstanceModel = (instanceId: string, model: string) => {
    setChatState((prev) => ({
      ...prev,
      activeInstances: prev.activeInstances.map((inst) =>
        inst.id === instanceId ? { ...inst, model } : inst
      ),
    }))
  }

  // ---- Get selected persona name ----
  const selectedPersona = personas.find((p) => p.id === selectedPersonaId)

  // ---- Render ----
  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Conversation Sidebar */}
      <ConversationSidebar
        activeId={activeConversationId}
        onSelect={loadConversation}
        onNew={clearChat}
        onDelete={handleDeleteConversation}
        isLoading={isBusy}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col max-w-6xl mx-auto px-4 py-4">
        {/* Top Bar */}
        <Card className="mb-4">
          <CardHeader className="pb-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-lg">Multi-LLM Chat</CardTitle>
              <div className="flex items-center space-x-2 flex-wrap gap-1">
                {/* Active model badges */}
                {chatState.activeInstances.map((instance) => (
                  <Badge
                    key={instance.id}
                    variant="secondary"
                    className="text-xs"
                  >
                    {instance.provider}/
                    {instance.model.split('/').pop()?.slice(0, 12)}
                  </Badge>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearChat}
                  disabled={isBusy || !hasMessages}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Clear
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/settings" aria-label="Open settings">
                    <Settings className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Persona Selector */}
            <div className="flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <select
                value={selectedPersonaId || ''}
                onChange={(e) =>
                  setSelectedPersonaId(e.target.value || null)
                }
                className="flex-1 p-1.5 border rounded text-xs bg-background max-w-xs"
                disabled={isBusy}
              >
                <option value="">No persona (default)</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              {selectedPersona && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {selectedPersona.description || selectedPersona.prompt.slice(0, 50)}
                </span>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
          {/* Messages Column */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 mb-4 rounded-md border p-4 bg-muted/20 overflow-y-auto">
              <div className="space-y-4">
                {/* System prompt indicator */}
                {selectedPersona && (
                  <div className="flex justify-center">
                    <Badge variant="outline" className="text-xs">
                      System prompt: {selectedPersona.title}
                    </Badge>
                  </div>
                )}

                {chatState.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === 'user'
                        ? 'justify-end'
                        : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-4 ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card border'
                      }`}
                    >
                      {/* Message header */}
                      <div className="flex items-center mb-1 gap-2">
                        {message.role === 'user' ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                        {message.provider && (
                          <span className="text-xs font-medium capitalize">
                            {message.provider}
                          </span>
                        )}
                        {message.model && (
                          <span className="text-xs text-muted-foreground">
                            ({message.model.split('/').pop()})
                          </span>
                        )}
                      </div>

                      {/* Message body: markdown for assistant, plain for user */}
                      {message.role === 'assistant' ? (
                        <MarkdownRenderer content={message.content} />
                      ) : (
                        <div className="whitespace-pre-wrap">
                          {message.content}
                        </div>
                      )}

                      {/* Token usage footer for assistant messages */}
                      {message.role === 'assistant' &&
                        message.completionTokens != null && (
                          <div className="mt-2 pt-1 border-t border-border/50 flex items-center gap-3 text-[10px] text-muted-foreground">
                            {message.promptTokens != null && (
                              <span>In: {message.promptTokens}</span>
                            )}
                            <span>Out: {message.completionTokens}</span>
                            {message.costUsd != null && (
                              <span>
                                ${message.costUsd.toFixed(5)}
                              </span>
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                ))}
                {!hasMessages && (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Add a model on the right and send a message to get started.
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={chatState.input}
                onChange={handleInputChange}
                placeholder="Type your message here..."
                disabled={isBusy}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    // Allow submit on Enter
                  }
                }}
              />
              <Button
                type="submit"
                disabled={isBusy || !chatState.input.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>

          {/* Right Panel: Model Management */}
          <div className="w-full md:w-72 flex-shrink-0 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Add Model</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {SUPPORTED_PROVIDERS.map((provider) => (
                    <Button
                      key={provider}
                      variant="outline"
                      size="sm"
                      onClick={() => addModelInstance(provider)}
                      disabled={isBusy}
                      className="text-xs capitalize"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {provider}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Active Models ({chatState.activeInstances.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {chatState.activeInstances.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No models active. Add one above.
                    </p>
                  ) : (
                    chatState.activeInstances.map((instance) => (
                      <div
                        key={instance.id}
                        className="p-2 border rounded-md bg-muted/30"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium capitalize">
                            {instance.provider}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeModelInstance(instance.id)}
                            disabled={isBusy}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <select
                          value={instance.model}
                          onChange={(e) =>
                            updateInstanceModel(instance.id, e.target.value)
                          }
                          className="w-full p-1.5 border rounded text-xs bg-background"
                          disabled={isBusy}
                        >
                          {AVAILABLE_MODELS[instance.provider]?.map(
                            (model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Page Export with Error Boundary ----
export default function MultiChatPage() {
  return (
    <ErrorBoundary level="page">
      <MultiChatPageContent />
    </ErrorBoundary>
  )
}
