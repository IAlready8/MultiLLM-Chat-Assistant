'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Bot, Play, Plus, RotateCcw, Square, Target, X } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { apiClient } from '@/lib/api-client'

const SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'googleai', 'openrouter', 'grok'] as const

const AVAILABLE_MODELS: Record<string, string[]> = {
  openai: ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-3-opus-20240229'
  ],
  googleai: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'],
  openrouter: ['openrouter/auto', 'openai/gpt-4', 'anthropic/claude-3-opus', 'google/gemini-pro'],
  grok: ['grok-beta', 'grok-2-1212']
}

type RoundtableMessage = {
  id: string
  kind: 'goal' | 'agent'
  content: string
  timestamp: Date
  agentId?: string
  agentName?: string
  provider?: string
  model?: string
}

type AgentConfig = {
  id: string
  name: string
  provider: string
  model: string
  systemPrompt: string
}

type StatusMessage = {
  type: 'info' | 'error' | 'success'
  text: string
}

const generateId = () => `rt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

const pickDefaultModel = (provider: string, index: number) => {
  const models = AVAILABLE_MODELS[provider] ?? []
  if (models.length === 0) return ''
  if (index > 0 && models[index]) return models[index]
  return models[0]
}

const buildAgentsForProviders = (providers: string[]) => {
  if (providers.length >= 2) {
    return providers.map((provider, index) => ({
      id: generateId(),
      name: `Agent ${index + 1}`,
      provider,
      model: pickDefaultModel(provider, 0),
      systemPrompt: ''
    }))
  }

  if (providers.length === 1) {
    const provider = providers[0]
    return [0, 1].map(index => ({
      id: generateId(),
      name: `Agent ${index + 1}`,
      provider,
      model: pickDefaultModel(provider, index),
      systemPrompt: ''
    }))
  }

  return [0, 1].map(index => ({
    id: generateId(),
    name: `Agent ${index + 1}`,
    provider: 'openai',
    model: pickDefaultModel('openai', index),
    systemPrompt: ''
  }))
}

const resolveAgentName = (name: string) => (name.trim() ? name.trim() : 'Agent')

const buildSystemPrompt = (agent: AgentConfig, goal: string) => {
  const agentName = resolveAgentName(agent.name)
  const base = [
    `You are ${agentName}, an AI participating in a roundtable conversation.`,
    `Goal: ${goal}`,
    'Respond to the most recent message from another agent.',
    'Keep replies concise and stay on topic.'
  ].join('\n')

  if (!agent.systemPrompt.trim()) {
    return base
  }

  return `${base}\n\nAdditional instructions:\n${agent.systemPrompt.trim()}`
}

const buildProviderMessages = (
  agent: AgentConfig,
  transcript: RoundtableMessage[],
  goal: string
) => {
  const history = transcript
    .filter(message => message.kind === 'agent')
    .map(message => ({
      role: message.agentId === agent.id ? 'assistant' : 'user',
      content: `${message.agentName ?? 'Agent'}: ${message.content}`
    }))

  if (history.length === 0) {
    history.push({
      role: 'user',
      content: `Goal: ${goal}\nStart the discussion.`
    })
  }

  return [{ role: 'system', content: buildSystemPrompt(agent, goal) }, ...history]
}

const streamProviderResponse = async (
  provider: string,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  model: string,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
) => {
  const response = await fetch('/api/llm/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, messages, model, stream: true }),
    signal
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

const deriveConversationTitle = (goal: string) => {
  const trimmed = goal.trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'Roundtable: New Goal'
  const maxLength = 48
  const base = trimmed.slice(0, maxLength)
  return `Roundtable: ${trimmed.length > maxLength ? `${base}...` : base}`
}

export default function AIRoundtablePage() {
  const { toast } = useToast()
  const [goal, setGoal] = useState('')
  const [maxTurns, setMaxTurns] = useState(6)
  const [messages, setMessages] = useState<RoundtableMessage[]>([])
  const [agents, setAgents] = useState<AgentConfig[]>(() => buildAgentsForProviders([]))
  const [isRunning, setIsRunning] = useState(false)
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isRunningRef = useRef(false)

  const loadConfiguredProviders = useCallback(async () => {
    try {
      const response = await fetch('/api/config', { cache: 'no-store' })
      if (!response.ok) {
        setConfiguredProviders([])
        setProvidersLoaded(true)
        return []
      }
      const data = await response.json()
      const configured = Array.isArray(data?.configuredProviders)
        ? data.configuredProviders
        : []
      const filtered = configured.filter((provider: string) =>
        SUPPORTED_PROVIDERS.includes(provider as (typeof SUPPORTED_PROVIDERS)[number])
      )

      if (filtered.length > 0) {
        setAgents(buildAgentsForProviders(filtered))
      }

      setConfiguredProviders(filtered)
      setProvidersLoaded(true)
      return filtered
    } catch (error) {
      console.error('Failed to load configured providers:', error)
      setConfiguredProviders([])
      setProvidersLoaded(true)
      toast({
        title: 'Error',
        description: 'Failed to load provider configuration status.',
        variant: 'destructive'
      })
      return []
    }
  }, [toast])

  useEffect(() => {
    void loadConfiguredProviders()
  }, [loadConfiguredProviders])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    isRunningRef.current = isRunning
  }, [isRunning])

  const handleGoalChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setGoal(e.target.value)
  }

  const handleMaxTurnsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value)
    if (Number.isNaN(value)) return
    const clamped = Math.max(2, Math.min(30, value))
    setMaxTurns(clamped)
  }

  const addAgent = (provider: string) => {
    const nextIndex = agents.length + 1
    const newAgent: AgentConfig = {
      id: generateId(),
      name: `Agent ${nextIndex}`,
      provider,
      model: pickDefaultModel(provider, 0),
      systemPrompt: ''
    }
    setAgents(prev => [...prev, newAgent])
  }

  const removeAgent = (agentId: string) => {
    setAgents(prev => prev.filter(agent => agent.id !== agentId))
  }

  const updateAgent = (agentId: string, updates: Partial<AgentConfig>) => {
    setAgents(prev =>
      prev.map(agent => (agent.id === agentId ? { ...agent, ...updates } : agent))
    )
  }

  const resetRoundtable = () => {
    setMessages([])
    setStatusMessage(null)
  }

  const stopRoundtable = () => {
    if (!isRunningRef.current) return
    setIsRunning(false)
    isRunningRef.current = false
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setStatusMessage({ type: 'info', text: 'Roundtable stopped.' })
  }

  const createConversation = async (goalText: string) => {
    try {
      const title = deriveConversationTitle(goalText)
      const newConversation = await apiClient.createConversation({
        title,
        messages: [
          {
            role: 'user',
            content: `Goal: ${goalText}`,
            provider: null,
            model: null
          }
        ]
      })
      return newConversation.id
    } catch (error) {
      console.error('Failed to create roundtable conversation:', error)
      toast({
        title: 'Error',
        description: 'Failed to create a new roundtable conversation.',
        variant: 'destructive'
      })
      return null
    }
  }

  const persistAssistantMessage = async (
    conversationId: string,
    agent: AgentConfig,
    content: string
  ) => {
    try {
      const agentLabel = resolveAgentName(agent.name)
      const storedContent = agentLabel ? `${agentLabel}: ${content}` : content
      await apiClient.addMessages(conversationId, [
        {
          role: 'assistant',
          content: storedContent,
          provider: agent.provider,
          model: agent.model || null
        }
      ])
    } catch (error) {
      console.error('Failed to save assistant message:', error)
      toast({
        title: 'Error',
        description: 'Failed to save a roundtable response.',
        variant: 'destructive'
      })
    }
  }

  const startRoundtable = async () => {
    if (isRunningRef.current) return

    setStatusMessage(null)
    const trimmedGoal = goal.trim()
    if (!trimmedGoal) {
      setStatusMessage({ type: 'error', text: 'Enter a goal before starting.' })
      toast({
        title: 'Goal Required',
        description: 'Enter a goal before starting the roundtable.',
        variant: 'destructive'
      })
      return
    }

    if (agents.length < 2) {
      setStatusMessage({ type: 'error', text: 'Add at least two agents to start.' })
      toast({
        title: 'Add More Agents',
        description: 'Add at least two agents to run a roundtable.',
        variant: 'destructive'
      })
      return
    }

    const invalidAgent = agents.find(agent => !agent.provider || !agent.model)
    if (invalidAgent) {
      setStatusMessage({ type: 'error', text: 'Each agent must have a provider and model selected.' })
      toast({
        title: 'Missing Model',
        description: 'Each agent must have a provider and model selected.',
        variant: 'destructive'
      })
      return
    }

    const resolvedProviders = providersLoaded
      ? configuredProviders
      : await loadConfiguredProviders()
    const providerList = resolvedProviders.length > 0 ? resolvedProviders : configuredProviders

    if (providerList.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'No provider keys configured yet. Add keys in Settings.'
      })
      return
    }

    const missingProviders = agents
      .map(agent => agent.provider)
      .filter(provider => !providerList.includes(provider))
    if (missingProviders.length > 0) {
      const uniqueMissing = Array.from(new Set(missingProviders))
      setStatusMessage({
        type: 'error',
        text: `Configure API keys for: ${uniqueMissing.join(', ')}.`
      })
      return
    }

    resetRoundtable()
    setIsRunning(true)
    isRunningRef.current = true
    setStatusMessage({ type: 'info', text: 'Roundtable running...' })

    const conversationId = await createConversation(trimmedGoal)
    if (!conversationId) {
      setIsRunning(false)
      isRunningRef.current = false
      setStatusMessage({ type: 'error', text: 'Failed to start a new roundtable conversation.' })
      return
    }

    abortControllerRef.current = new AbortController()
    let workingMessages: RoundtableMessage[] = []

    const goalMessage: RoundtableMessage = {
      id: generateId(),
      kind: 'goal',
      content: trimmedGoal,
      timestamp: new Date()
    }
    workingMessages = [goalMessage]
    setMessages(workingMessages)

    let endState: 'completed' | 'stopped' | 'error' | null = null

    try {
      for (let turn = 0; turn < maxTurns; turn += 1) {
        if (!isRunningRef.current) {
          endState = 'stopped'
          break
        }

        const agent = agents[turn % agents.length]
        const agentLabel = resolveAgentName(agent.name)
        const typingId = generateId()
        const promptMessages = buildProviderMessages(agent, workingMessages, trimmedGoal)

        const placeholder: RoundtableMessage = {
          id: typingId,
          kind: 'agent',
          content: 'Thinking...',
          timestamp: new Date(),
          agentId: agent.id,
          agentName: agentLabel,
          provider: agent.provider,
          model: agent.model
        }

        workingMessages = [...workingMessages, placeholder]
        setMessages(workingMessages)

        let streamedContent = ''

        try {
          const fullContent = await streamProviderResponse(
            agent.provider,
            promptMessages,
            agent.model,
            (chunk) => {
              streamedContent += chunk
              workingMessages = workingMessages.map(message =>
                message.id === typingId
                  ? { ...message, content: streamedContent || 'Thinking...' }
                  : message
              )
              setMessages(workingMessages)
            },
            abortControllerRef.current?.signal
          )

          if (!isRunningRef.current) break

          const trimmedContent = fullContent.trim()
          const finalContent = trimmedContent || 'No response returned.'

          workingMessages = workingMessages.map(message =>
            message.id === typingId ? { ...message, content: finalContent } : message
          )
          setMessages(workingMessages)

          if (trimmedContent) {
            await persistAssistantMessage(conversationId, agent, trimmedContent)
          }
        } catch (error) {
          if ((error as Error)?.name === 'AbortError') {
            endState = 'stopped'
            break
          }

          console.error('Roundtable provider error:', error)
          const errorMessage = (error as Error).message || 'Failed to get a response.'
          endState = 'error'
          workingMessages = workingMessages.map(message =>
            message.id === typingId ? { ...message, content: `Error: ${errorMessage}` } : message
          )
          setMessages(workingMessages)
          setStatusMessage({ type: 'error', text: errorMessage })
          toast({
            title: 'Provider Error',
            description: errorMessage,
            variant: 'destructive'
          })
          break
        }
      }
      if (!endState) {
        endState = 'completed'
      }
    } finally {
      setIsRunning(false)
      isRunningRef.current = false
      abortControllerRef.current = null
      if (endState === 'completed') {
        setStatusMessage({ type: 'success', text: 'Roundtable finished.' })
      } else if (endState === 'stopped') {
        setStatusMessage({ type: 'info', text: 'Roundtable stopped.' })
      }
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-6xl mx-auto">
      <Card className="mb-4">
        <CardHeader className="pb-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>AI Roundtable</CardTitle>
              <Badge variant="secondary">Beta</Badge>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 flex-wrap gap-1">
                {agents.map(agent => (
                  <Badge key={agent.id} variant="secondary" className="text-xs">
                    {resolveAgentName(agent.name)} ({agent.provider}/{agent.model.split('/').pop()})
                  </Badge>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={resetRoundtable} disabled={isRunning}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure each agent and watch the models discuss your goal turn-by-turn.
          </p>
        </CardHeader>
      </Card>

      <div className="flex-1 flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex flex-col">
          <div className="flex-1 mb-4 rounded-md border p-4 bg-muted/20 max-h-[calc(100vh-200px)] overflow-y-auto">
            <div className="space-y-4">
              {messages.map(message => (
                <div key={message.id} className="flex justify-start">
                  <div className="max-w-[85%] rounded-lg p-4 bg-card border">
                    <div className="flex items-center mb-1 gap-2">
                      {message.kind === 'goal' ? (
                        <>
                          <Target className="h-4 w-4" />
                          <span className="text-xs font-medium uppercase">Goal</span>
                        </>
                      ) : (
                        <>
                          <Bot className="h-4 w-4" />
                          <span className="text-xs font-medium">{message.agentName ?? 'Agent'}</span>
                          {message.provider && (
                            <span className="text-xs text-muted-foreground">
                              {message.provider}/{message.model?.split('/').pop()}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  Add a goal and start the roundtable to watch agents converse.
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        <div className="w-full md:w-80 flex-shrink-0 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Conversation Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <span className="text-xs font-medium">Goal</span>
                <Textarea
                  value={goal}
                  onChange={handleGoalChange}
                  placeholder="Describe the objective for the AI conversation..."
                  className="min-h-[90px]"
                  disabled={isRunning}
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium">Total Turns</span>
                <Input
                  type="number"
                  min={2}
                  max={30}
                  value={maxTurns}
                  onChange={handleMaxTurnsChange}
                  disabled={isRunning}
                />
                <p className="text-xs text-muted-foreground">Each turn is one agent response.</p>
              </div>
              {statusMessage && (
                <div
                  className={`rounded-md border px-3 py-2 text-xs ${
                    statusMessage.type === 'error'
                      ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : statusMessage.type === 'success'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
                        : 'border-border/60 bg-muted/40 text-muted-foreground'
                  }`}
                >
                  {statusMessage.text}
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={startRoundtable} disabled={isRunning}>
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </Button>
                <Button variant="outline" onClick={stopRoundtable} disabled={!isRunning}>
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Add Agent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {SUPPORTED_PROVIDERS.map(provider => (
                  <Button
                    key={provider}
                    variant="outline"
                    size="sm"
                    onClick={() => addAgent(provider)}
                    disabled={isRunning}
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
              <CardTitle className="text-sm">Agents ({agents.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[420px] overflow-y-auto">
                {agents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No agents active. Add one above.</p>
                ) : (
                  agents.map(agent => (
                    <div key={agent.id} className="p-2 border rounded-md bg-muted/30 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          value={agent.name}
                          onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
                          className="text-xs"
                          disabled={isRunning}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAgent(agent.id)}
                          disabled={isRunning}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="text-[11px] text-muted-foreground capitalize">
                        {agent.provider}
                      </div>
                      <select
                        value={agent.model}
                        onChange={(e) => updateAgent(agent.id, { model: e.target.value })}
                        className="w-full p-1.5 border rounded text-xs bg-background"
                        disabled={isRunning}
                      >
                        {AVAILABLE_MODELS[agent.provider]?.map(model => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                      <Textarea
                        value={agent.systemPrompt}
                        onChange={(e) => updateAgent(agent.id, { systemPrompt: e.target.value })}
                        placeholder="System instructions for this agent..."
                        className="min-h-[80px] text-xs"
                        disabled={isRunning}
                      />
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
