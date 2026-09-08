'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Send,
  Square,
  Bot,
  User,
  RotateCcw,
  Settings,
  Plus,
  X,
  Trash2,
  Pencil,
  Check,
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { readChatStream } from '@/services/stream-client'
import { buildModelHistory } from '@/lib/model-history'
import { apiClient } from '@/lib/api-client'
import { getDefaultModel, getModelsForProvider } from '@/lib/model-catalog'
import { operationalProviderRegistry } from '@/lib/provider-registry'
import type { Conversation, Message as ConversationMessage } from '@/types/prisma'
import Link from 'next/link'

const PROVIDER_OPTIONS = operationalProviderRegistry
  .map(provider => ({
    ...provider,
    models: getModelsForProvider(provider.id),
  }))
  .filter(provider => provider.models.length > 0)

const SUPPORTED_PROVIDER_IDS = PROVIDER_OPTIONS.map(provider => provider.id)
const SUPPORTED_PROVIDER_SET = new Set(SUPPORTED_PROVIDER_IDS)

const isSupportedProvider = (provider: string) =>
  SUPPORTED_PROVIDER_SET.has(provider)

const getProviderLabel = (provider: string) => {
  const meta = PROVIDER_OPTIONS.find(option => option.id === provider)
  if (!meta) return provider
  return meta.requiresApiKey ? meta.name : `${meta.name} (local)`
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  provider?: string
  model?: string
  instanceId?: string
  turnId?: string
  generationStatus?: string
  requestId?: string
  position?: number
  error?: string
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
    activeInstances: [
      { id: 'default-openai', provider: 'openai', model: getDefaultModel('openai') }
    ]
  })

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [conversationList, setConversationList] = useState<Conversation[]>([])
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingConversationTitle, setEditingConversationTitle] = useState('')
  const [isLoadingConversationList, setIsLoadingConversationList] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const { toast } = useToast()
  const { status } = useSession()
  const runRef = useRef<AbortController | null>(null)
  useEffect(() => () => { runRef.current?.abort() }, [])
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
        isSupportedProvider(provider)
      )

      // Create default instances for configured providers
      if (filtered.length > 0) {
        const instances: ModelInstance[] = filtered.map((provider: string) => ({
          id: generateInstanceId(),
          provider,
          model: getDefaultModel(provider)
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
        id: msg.clientId || msg.id,
        role: msg.role as Message['role'],
        content: msg.content,
        timestamp: new Date(msg.createdAt),
        provider: msg.provider ?? undefined,
        model: msg.model ?? undefined,
        instanceId: msg.instanceId ?? undefined,
        turnId: msg.turnId ?? undefined,
        position: msg.position ?? undefined,
        generationStatus: msg.generationStatus === 'running' && Date.now() - new Date(msg.createdAt).getTime() > 120_000 ? 'interrupted' : msg.generationStatus,

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
      if (status !== 'authenticated') {
        setIsLoadingHistory(false)
        return
      }

      await loadConfiguredProviders()
      await loadLatestConversation()
    }
    void load()
  }, [loadConfiguredProviders, loadLatestConversation, status])

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

  const beginRenameConversation = (conversation: Conversation) => {
    setEditingConversationId(conversation.id)
    setEditingConversationTitle(conversation.title || '')
  }

  const cancelRenameConversation = () => {
    setEditingConversationId(null)
    setEditingConversationTitle('')
  }

  const renameConversationById = async (conversationId: string) => {
    const nextTitle = editingConversationTitle.trim()
    if (!nextTitle) {
      toast({
        title: 'Invalid title',
        description: 'Conversation title cannot be empty.',
        variant: 'destructive',
      })
      return
    }

    try {
      const updatedConversation = await apiClient.updateConversation(conversationId, {
        title: nextTitle,
      })

      setConversationList(prev =>
        prev.map(conversation =>
          conversation.id === conversationId
            ? {
                ...conversation,
                title: updatedConversation.title,
                updatedAt: new Date(updatedConversation.updatedAt),
              }
            : conversation
        )
      )

      cancelRenameConversation()
    } catch (error) {
      console.error('Failed to rename conversation:', error)
      toast({
        title: 'Error',
        description: 'Failed to rename conversation.',
        variant: 'destructive',
      })
    }
  }

  const deleteConversationById = async (conversationId: string) => {
    try {
      await apiClient.deleteConversation(conversationId)
      setConversationList(prev =>
        prev.filter(conversation => conversation.id !== conversationId)
      )

      if (editingConversationId === conversationId) {
        cancelRenameConversation()
      }

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

  const ensureConversation = async (userContent: string, clientId: string) => {
    if (status !== 'authenticated') {
      return null
    }

    const userMessage = {
      role: 'user' as const,
      content: userContent,
      clientId,
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

  type ProviderRequestError = Error & {
    code?: string
    status?: number
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

  const callInstance = async (instance: ModelInstance, messages: Message[], conversationId: string, response: Message, signal: AbortSignal) => {
    const update = (change: Partial<Message>) => setChatState(prev => ({ ...prev, messages: prev.messages.map(message => message.id === response.id ? { ...message, ...change } : message) }))
    let content = ''
    try {
      const result = await fetch('/api/llm/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ provider: instance.provider, model: instance.model, messages: buildModelHistory(messages, instance), conversationId, requestId: response.requestId, turnId: response.turnId, instanceId: instance.id, position: response.position }),
      })
      await readChatStream(result, chunk => { content += chunk; update({ content }) }, signal)
      update({ generationStatus: 'complete' })
      touchConversation(conversationId)
    } catch (error) {
      const canceled = signal.aborted
      update({ content, generationStatus: canceled ? 'canceled' : 'failed', error: canceled ? undefined : toProviderDisplayError(error as ProviderRequestError) })
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!chatState.input.trim() || isBusy || runRef.current) return
    if (!chatState.activeInstances.length) {
      toast({ title: 'No Models Enabled', description: 'Add at least one model before sending a message.', variant: 'destructive' })
      return
    }
    const controller = new AbortController()
    runRef.current = controller
    setChatState(prev => ({ ...prev, isLoading: true }))
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: chatState.input, timestamp: new Date() }
    try {
      const conversationId = await ensureConversation(userMessage.content, userMessage.id)
      if (!conversationId || controller.signal.aborted) return
      const responses: Message[] = chatState.activeInstances.map((instance, position) => ({ id: crypto.randomUUID(), requestId: crypto.randomUUID(), turnId: userMessage.id, position, role: 'assistant', content: '', timestamp: new Date(), provider: instance.provider, model: instance.model, instanceId: instance.id, generationStatus: 'running' }))
      const history = [...chatState.messages, userMessage]
      setChatState(prev => ({ ...prev, input: '', messages: [...prev.messages, userMessage, ...responses] }))
      await Promise.all(chatState.activeInstances.map((instance, index) => callInstance(instance, history, conversationId, responses[index], controller.signal)))
    } finally {
      runRef.current = null
      setChatState(prev => ({ ...prev, isLoading: false }))
    }
  }

  const regenerate = async (message: Message) => {
    if (isBusy || runRef.current || !activeConversationId || !message.provider || !message.model || !message.turnId) return
    const turnIndex = chatState.messages.findIndex(item => item.id === message.turnId)
    if (turnIndex < 0) return
    const controller = new AbortController()
    runRef.current = controller
    const response: Message = { ...message, id: crypto.randomUUID(), requestId: crypto.randomUUID(), content: '', error: undefined, generationStatus: 'running', timestamp: new Date() }
    setChatState(prev => {
      const lastAlternative = prev.messages.reduce((index, item, current) => item.turnId === message.turnId && item.position === message.position ? current : index, turnIndex)
      return { ...prev, isLoading: true, messages: [...prev.messages.slice(0, lastAlternative + 1), response, ...prev.messages.slice(lastAlternative + 1)] }
    })
    try {
      await callInstance({ id: message.instanceId || generateInstanceId(), provider: message.provider, model: message.model }, chatState.messages.slice(0, turnIndex + 1), activeConversationId, response, controller.signal)
    } finally {
      runRef.current = null
      setChatState(prev => ({ ...prev, isLoading: false }))
    }
  }

  const clearChat = () => {
    setActiveConversationId(null)
    cancelRenameConversation()
    setChatState(prev => ({
      ...prev,
      messages: [],
      input: '',
      isLoading: false
    }))
  }

  const addModelInstance = (provider: string) => {
    if (chatState.activeInstances.length >= 8) return
    const newInstance: ModelInstance = {
      id: generateInstanceId(),
      provider,
      model: getDefaultModel(provider)
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
                    <div className="whitespace-pre-wrap break-words">{message.content || (message.generationStatus === 'running' ? 'Thinking...' : '')}</div>
                    {message.generationStatus && message.generationStatus !== 'complete' && (
                      <p role={message.error ? 'alert' : 'status'} className="mt-2 text-sm text-muted-foreground">
                        {message.error ? `Error: ${message.error}` : message.generationStatus === 'running' ? 'Generating...' : message.generationStatus === 'canceled' ? 'Stopped. Reload to check saved progress.' : 'Response interrupted. Regenerate to try again.'}
                      </p>
                    )}
                    {message.role === 'assistant' && message.turnId && message.generationStatus !== 'running' && (
                      <Button variant="ghost" size="sm" className="mt-2" disabled={isBusy} onClick={() => regenerate(message)} aria-label={`Regenerate ${message.provider}/${message.model}`}>
                        <RotateCcw className="mr-2 h-3 w-3" />Regenerate
                      </Button>
                    )}
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
              aria-label="Message"
              disabled={isBusy}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={isBusy || !chatState.input.trim()}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
            {chatState.isLoading && <Button type="button" variant="outline" onClick={() => runRef.current?.abort()} aria-label="Stop generation"><Square className="mr-2 h-4 w-4" />Stop</Button>}
          </form>
        </div>

        <div className="w-full md:w-72 flex-shrink-0 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Add Model</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDER_OPTIONS.map(provider => (
                  <Button
                    key={provider.id}
                    variant="outline"
                    size="sm"
                    onClick={() => addModelInstance(provider.id)}
                    disabled={isBusy || chatState.activeInstances.length >= 8}
                    className="text-xs"
                    title={provider.description}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {getProviderLabel(provider.id)}
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
                        <span className="text-xs font-medium">
                          {getProviderLabel(instance.provider)}
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
                        onChange={(e) => updateInstanceModel(instance.id, e.target.value)}
                        className="w-full p-1.5 border rounded text-xs bg-background"
                        disabled={isBusy}
                      >
                        {getModelsForProvider(instance.provider).map(model => (
                          <option key={model.id} value={model.id}>
                            {model.displayName}
                          </option>
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
                      {editingConversationId === conversation.id ? (
                        <div className="flex w-full items-center gap-2">
                          <div className="flex-1 space-y-1">
                            <Input
                              value={editingConversationTitle}
                              onChange={event =>
                                setEditingConversationTitle(event.target.value)
                              }
                              onKeyDown={event => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  void renameConversationById(conversation.id)
                                } else if (event.key === 'Escape') {
                                  cancelRenameConversation()
                                }
                              }}
                              className="h-7 text-xs"
                              disabled={isBusy}
                              autoFocus
                              aria-label="Conversation title"
                            />
                            <p className="text-[11px] text-muted-foreground">
                              {formatConversationTimestamp(conversation.updatedAt)}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => void renameConversationById(conversation.id)}
                            disabled={isBusy}
                            aria-label="Save conversation title"
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={cancelRenameConversation}
                            disabled={isBusy}
                            aria-label="Cancel conversation rename"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="flex-1 text-left"
                            onClick={() => void loadConversationById(conversation.id)}
                            disabled={isBusy}
                            aria-label={`Load conversation ${conversation.title || conversation.id}`}
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
                            onClick={() => beginRenameConversation(conversation)}
                            disabled={isBusy}
                            aria-label={`Rename conversation ${conversation.title || conversation.id}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => void deleteConversationById(conversation.id)}
                            disabled={isBusy}
                            aria-label={`Delete conversation ${conversation.title || conversation.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
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
