'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Send, Bot, User, RotateCcw, Settings, Plus, X, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { apiClient } from '@/lib/api-client'
import type { Conversation, Message as ConversationMessage } from '@/types/prisma'
import Link from 'next/link'

const SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'googleai', 'openrouter', 'grok'] as const

const AVAILABLE_MODELS: Record<string, string[]> = {
  openai: ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
  googleai: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'],
  openrouter: ['openrouter/auto', 'openai/gpt-4', 'anthropic/claude-3-opus', 'google/gemini-pro'],
  grok: ['grok-beta', 'grok-2-1212']
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  provider?: string
  model?: string
  instanceId?: string
}

// Each active model instance has a unique ID, provider, and model
interface ModelInstance {
  id: string
  provider: string
  model: string
}

interface ChatState {
  messages: Message[]
  input: string
  isLoading: boolean
  activeInstances: ModelInstance[]
}

export default function MultiChatPage() {
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    input: '',
    isLoading: false,
    activeInstances: [{ id: 'default-openai', provider: 'openai', model: 'gpt-4' }]
  })

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [conversationList, setConversationList] = useState<Conversation[]>([])
  const [isLoadingConversationList, setIsLoadingConversationList] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const { toast } = useToast()
  const { status } = useSession()
  const strictAuthEnabled = process.env.NEXT_PUBLIC_AUTH_REQUIRE_LOGIN === 'true'
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isBusy = chatState.isLoading || isLoadingHistory
  const hasMessages = chatState.messages.length > 0

  const generateInstanceId = () => `instance-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

  const formatConversationTimestamp = (value: Date | string) => {
    const timestamp = new Date(value)
    if (Number.isNaN(timestamp.getTime())) return 'Unknown'
    return timestamp.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const loadConfiguredProviders = useCallback(async () => {
    try {
      const response = await fetch('/api/config', { cache: 'no-store' })
      if (!response.ok) {
        return
      }

      const data = await response.json()
      const configured = Array.isArray(data?.configuredProviders)
        ? data.configuredProviders
        : []
      const filtered = configured.filter((provider: string) =>
        SUPPORTED_PROVIDERS.includes(provider as (typeof SUPPORTED_PROVIDERS)[number])
      )

      // Create default instances for configured providers
      if (filtered.length > 0) {
        const instances: ModelInstance[] = filtered.map((provider: string) => ({
          id: generateInstanceId(),
          provider,
          model: AVAILABLE_MODELS[provider]?.[0] || ''
        }))
        setChatState(prev => ({ ...prev, activeInstances: instances }))
      }
    } catch (error) {
      console.error('Failed to load configured providers:', error)
      toast({
        title: 'Error',
        description: 'Failed to load provider configuration status.',
        variant: 'destructive'
      })
    }
  }, [toast])

  const refreshConversationList = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        setIsLoadingConversationList(true)
        const conversations = await apiClient.getConversations()
        setConversationList(conversations)
        return conversations
      } catch (error) {
        console.error('Failed to refresh conversation list:', error)
        if (!options?.silent) {
          toast({
            title: 'Error',
            description: 'Failed to load conversations.',
            variant: 'destructive',
          })
        }
        return [] as Conversation[]
      } finally {
        setIsLoadingConversationList(false)
      }
    },
    [toast]
  )

  const hydrateConversationMessages = (conversation: {
    id: string
    messages: ConversationMessage[]
  }) => {
    const restoredMessages: Message[] = conversation.messages.map(
      (msg: ConversationMessage) => ({
        id: msg.id,
        role: msg.role as Message['role'],
        content: msg.content,
        timestamp: new Date(msg.createdAt),
        provider: msg.provider ?? undefined,
        model: msg.model ?? undefined,
      })
    )

    setActiveConversationId(conversation.id)
    setChatState(prev => ({
      ...prev,
      messages: restoredMessages,
    }))
  }

  const touchConversation = useCallback((conversationId: string) => {
    setConversationList(prev => {
      const match = prev.find(item => item.id === conversationId)
      if (!match) return prev

      const updated: Conversation = {
        ...match,
        updatedAt: new Date(),
      }

      return [updated, ...prev.filter(item => item.id !== conversationId)]
    })
  }, [])

  const loadLatestConversation = useCallback(async () => {
    try {
      setIsLoadingHistory(true)
      const conversations = await refreshConversationList({ silent: true })
      if (conversations.length === 0) {
        setActiveConversationId(null)
        setChatState(prev => ({ ...prev, messages: [] }))
        return
      }

      const latest = conversations[0]
      const conversation = await apiClient.getConversation(latest.id)
      hydrateConversationMessages(conversation)
    } catch (error) {
      console.error('Failed to load conversation history:', error)
      toast({
        title: 'Error',
        description: 'Failed to load conversation history.',
        variant: 'destructive'
      })
    } finally {
      setIsLoadingHistory(false)
    }
  }, [refreshConversationList, toast])

  useEffect(() => {
    if (status === 'loading') {
      return
    }

    const load = async () => {
      await loadConfiguredProviders()
      if (strictAuthEnabled && status !== 'authenticated') {
        setIsLoadingHistory(false)
        return
      }

      await loadLatestConversation()
    }
    void load()
  }, [loadConfiguredProviders, loadLatestConversation, status, strictAuthEnabled])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatState.messages])

  const loadConversationById = async (conversationId: string) => {
    try {
      setIsLoadingHistory(true)
      const conversation = await apiClient.getConversation(conversationId)
      hydrateConversationMessages(conversation)
    } catch (error) {
      console.error('Failed to load conversation:', error)
      toast({
        title: 'Error',
        description: 'Failed to load selected conversation.',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const deleteConversationById = async (conversationId: string) => {
    try {
      await apiClient.deleteConversation(conversationId)
      setConversationList(prev =>
        prev.filter(conversation => conversation.id !== conversationId)
      )

      if (activeConversationId === conversationId) {
        setActiveConversationId(null)
        setChatState(prev => ({ ...prev, messages: [] }))
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete conversation.',
        variant: 'destructive',
      })
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChatState(prev => ({ ...prev, input: e.target.value }))
  }

  const deriveConversationTitle = (content: string) => {
    const trimmed = content.trim().replace(/\s+/g, ' ')
    if (!trimmed) return 'New Conversation'
    const maxLength = 60
    const base = trimmed.slice(0, maxLength)
    return trimmed.length > maxLength ? `${base}...` : base
  }

  const ensureConversation = async (userContent: string) => {
    if (strictAuthEnabled && status !== 'authenticated') {
      return null
    }

    const userMessage = {
      role: 'user' as const,
      content: userContent,
      provider: null,
      model: null
    }

    try {
      if (activeConversationId) {
        await apiClient.addMessages(activeConversationId, [userMessage])
        touchConversation(activeConversationId)
        return activeConversationId
      }

      const title = deriveConversationTitle(userContent)
      const newConversation = await apiClient.createConversation({
        title,
        messages: [userMessage]
      })
      setActiveConversationId(newConversation.id)
      setConversationList(prev => [
        newConversation,
        ...prev.filter(conversation => conversation.id !== newConversation.id),
      ])
      return newConversation.id
    } catch (error) {
      console.error('Failed to save user message:', error)
      toast({
        title: 'Error',
        description: 'Failed to save your message.',
        variant: 'destructive'
      })
      return null
    }
  }

  const persistAssistantMessage = async (
    conversationId: string,
    provider: string,
    model: string | undefined,
    content: string
  ) => {
    const message = {
      role: 'assistant' as const,
      content,
      provider,
      model: model ?? null
    }

    try {
      await apiClient.addMessages(conversationId, [message])
      touchConversation(conversationId)
    } catch (error) {
      console.error('Failed to save assistant message:', error)
      toast({
        title: 'Error',
        description: 'Failed to save assistant response.',
        variant: 'destructive'
      })
    }
  }

  type ProviderRequestError = Error & {
    code?: string
    status?: number
  }

  const createProviderRequestError = (
    message: string,
    status?: number,
    code?: string
  ): ProviderRequestError => {
    const error = new Error(message) as ProviderRequestError
    error.status = status
    error.code = code
    return error
  }

  const toProviderDisplayError = (error: ProviderRequestError): string => {
    if (error.code === 'PROVIDER_NOT_CONFIGURED') {
      return 'No API key is configured for this provider. Add it in Settings.'
    }
    if (error.code === 'PROVIDER_AUTH_ERROR') {
      return 'The saved API key was rejected. Please update it in Settings.'
    }
    if (error.code === 'RATE_LIMITED' || error.status === 429) {
      return 'Rate limit reached. Please wait a moment and retry.'
    }
    if (error.code === 'PROVIDER_TIMEOUT' || error.status === 504) {
      return 'The provider timed out. Try again or switch models.'
    }
    if (
      error.code === 'PROVIDER_UNAVAILABLE' ||
      error.code === 'NETWORK_ERROR' ||
      error.status === 503
    ) {
      return 'Provider temporarily unavailable. Please retry shortly.'
    }
    return error.message || 'Failed to get response from provider'
  }

  const streamProviderResponse = async (
    provider: string,
    messages: Array<{ role: Message['role']; content: string }>,
    model: string,
    onChunk: (chunk: string) => void
  ) => {
    const response = await fetch('/api/llm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, messages, model, stream: true })
    })

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`
      let errorCode: string | undefined
      try {
        const errorBody = await response.json()
        errorMessage = errorBody?.error || errorMessage
        errorCode =
          typeof errorBody?.code === 'string' ? errorBody.code : undefined
      } catch {}
      throw createProviderRequestError(errorMessage, response.status, errorCode)
    }

    if (!response.body) {
      throw createProviderRequestError(
        'No response body received',
        502,
        'EMPTY_RESPONSE_BODY'
      )
    }

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

    return fullContent
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatState.input.trim() || chatState.isLoading || isLoadingHistory) return
    if (chatState.activeInstances.length === 0) {
      toast({
        title: 'No Models Enabled',
        description: 'Add at least one model before sending a message.',
        variant: 'destructive'
      })
      return
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: chatState.input,
      timestamp: new Date()
    }

    const typingIds: Record<string, string> = {}
    const initialAssistantMessages = chatState.activeInstances.map(instance => {
      const id = `typing-${instance.id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
      typingIds[instance.id] = id
      return {
        id,
        role: 'assistant' as const,
        content: 'Thinking...',
        timestamp: new Date(),
        provider: instance.provider,
        model: instance.model,
        instanceId: instance.id
      }
    })

    const messageHistory = chatState.messages.concat(userMessage)

    setChatState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage, ...initialAssistantMessages],
      input: '',
      isLoading: true
    }))

    const conversationId = await ensureConversation(userMessage.content)

    const instancePromises = chatState.activeInstances.map(instance => {
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
        variant: 'destructive'
      })
    } finally {
      setChatState(prev => ({ ...prev, isLoading: false }))
    }
  }

  const callInstance = async (
    instance: ModelInstance,
    messages: Message[],
    conversationId: string | null,
    typingId: string
  ) => {
    try {
      const { provider, model } = instance
      if (!model) {
        throw new Error(`No model selected for instance`)
      }

      const fullMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      const fullContent = await streamProviderResponse(
        provider,
        fullMessages,
        model,
        (chunk) => {
          setChatState(prev => {
            const updatedMessages = prev.messages.map(msg => {
              if (msg.id === typingId) {
                return {
                  ...msg,
                  content: msg.content === 'Thinking...' ? chunk : msg.content + chunk
                }
              }
              return msg
            })
            return { ...prev, messages: updatedMessages }
          })
        }
      )

      if (conversationId && fullContent.trim()) {
        await persistAssistantMessage(conversationId, provider, model, fullContent.trim())
      }
    } catch (error) {
      console.error(`Error calling instance ${instance.provider}/${instance.model}:`, error)
      const providerError = error as ProviderRequestError
      const displayError = toProviderDisplayError(providerError)

      setChatState(prev => {
        const updatedMessages = prev.messages.map(msg => {
          if (msg.id === typingId) {
            return {
              ...msg,
              content: `Error: ${displayError}`,
              timestamp: new Date()
            }
          }
          return msg
        })
        return { ...prev, messages: updatedMessages }
      })

      toast({
        title: 'Provider Error',
        description: `Failed to get response from ${instance.provider}/${instance.model}: ${displayError}`,
        variant: 'destructive'
      })
    }
  }

  const clearChat = () => {
    setActiveConversationId(null)
    setChatState(prev => ({
      ...prev,
      messages: [],
      input: '',
      isLoading: false
    }))
  }

  const addModelInstance = (provider: string) => {
    const newInstance: ModelInstance = {
      id: generateInstanceId(),
      provider,
      model: AVAILABLE_MODELS[provider]?.[0] || ''
    }
    setChatState(prev => ({
      ...prev,
      activeInstances: [...prev.activeInstances, newInstance]
    }))
  }

  const removeModelInstance = (instanceId: string) => {
    setChatState(prev => ({
      ...prev,
      activeInstances: prev.activeInstances.filter(inst => inst.id !== instanceId)
    }))
  }

  const updateInstanceModel = (instanceId: string, model: string) => {
    setChatState(prev => ({
      ...prev,
      activeInstances: prev.activeInstances.map(inst =>
        inst.id === instanceId ? { ...inst, model } : inst
      )
    }))
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-6xl mx-auto">
      <Card className="mb-4">
        <CardHeader className="pb-3 space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle>Multi-LLM Chat</CardTitle>
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 flex-wrap gap-1">
                {chatState.activeInstances.map(instance => (
                  <Badge key={instance.id} variant="secondary" className="text-xs">
                    {instance.provider}/{instance.model.split('/').pop()?.slice(0, 12)}
                  </Badge>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={clearChat} disabled={isBusy || !hasMessages}>
                <RotateCcw className="h-4 w-4 mr-2" />
                New Chat
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings" aria-label="Open settings">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Send one prompt to multiple models and compare responses side-by-side.
          </p>
        </CardHeader>
      </Card>

      <div className="flex-1 flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex flex-col">
          <div className="flex-1 mb-4 rounded-md border p-4 bg-muted/20 max-h-[calc(100vh-200px)] overflow-y-auto">
            <div className="space-y-4">
              {chatState.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-4 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border'
                    }`}
                  >
                    <div className="flex items-center mb-1 gap-2">
                      {message.role === 'user' ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                      {message.provider && (
                        <span className="text-xs font-medium capitalize">{message.provider}</span>
                      )}
                      {message.model && (
                        <span className="text-xs text-muted-foreground">({message.model.split('/').pop()})</span>
                      )}
                    </div>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))}
              {!hasMessages && (
                <div className="text-sm text-muted-foreground">
                  Add a model on the right and send a message to get started.
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={chatState.input}
              onChange={handleInputChange}
              placeholder="Type your message here..."
              disabled={isBusy}
              className="flex-1"
            />
            <Button type="submit" disabled={isBusy || !chatState.input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>

        <div className="w-full md:w-72 flex-shrink-0 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Add Model</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {SUPPORTED_PROVIDERS.map(provider => (
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
              <CardTitle className="text-sm">Active Models ({chatState.activeInstances.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {chatState.activeInstances.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No models active. Add one above.</p>
                ) : (
                  chatState.activeInstances.map(instance => (
                    <div key={instance.id} className="p-2 border rounded-md bg-muted/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium capitalize">{instance.provider}</span>
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
                        onChange={(e) => updateInstanceModel(instance.id, e.target.value)}
                        className="w-full p-1.5 border rounded text-xs bg-background"
                        disabled={isBusy}
                      >
                        {AVAILABLE_MODELS[instance.provider]?.map(model => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Recent Conversations ({conversationList.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[280px] overflow-y-auto">
                {isLoadingConversationList ? (
                  <p className="text-xs text-muted-foreground">Loading conversations...</p>
                ) : conversationList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No saved conversations yet.
                  </p>
                ) : (
                  conversationList.map(conversation => (
                    <div
                      key={conversation.id}
                      className={`flex items-start gap-2 rounded-md border p-2 ${
                        activeConversationId === conversation.id
                          ? 'border-primary bg-primary/10'
                          : 'bg-muted/20'
                      }`}
                    >
                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() => void loadConversationById(conversation.id)}
                        disabled={isBusy}
                      >
                        <p className="truncate text-xs font-medium">
                          {conversation.title || 'Untitled conversation'}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatConversationTimestamp(conversation.updatedAt)}
                        </p>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => void deleteConversationById(conversation.id)}
                        disabled={isBusy}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
