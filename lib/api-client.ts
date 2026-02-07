import { Persona, Conversation, Message } from '@/types/prisma'

// --- Types ---
type NewPersona = Omit<Persona, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
type NewMessage = Omit<Message, 'id' | 'conversationId' | 'createdAt'>
type NewConversation = {
  title: string
  messages: NewMessage[]
}

// Types for Orchestration
type ProviderRequest = {
  provider: string
  model: string
  prompt: string
}
type OrchestrateRequest = {
  requests: ProviderRequest[]
  prompt: string
}
// This should match the Python schema
type ProviderResponse = {
  provider: string
  model: string
  content: string
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  latency_ms: number
}

// --- Helper ---
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const errorMessage =
      errorData.error || `HTTP error! status: ${response.status}`
    console.error('API Client Error:', errorMessage, errorData.details)
    throw new Error(errorMessage)
  }
  return response.json()
}

// --- API Client ---
export const apiClient = {
  // --- Persona API Calls ---
  async getPersonas(): Promise<Persona[]> {
    return handleResponse(await fetch('/api/personas'))
  },
  async createPersona(data: NewPersona): Promise<Persona> {
    return handleResponse(
      await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    )
  },
  async updatePersona(
    id: string,
    data: Partial<NewPersona>
  ): Promise<Persona> {
    return handleResponse(
      await fetch(`/api/personas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    )
  },
  async deletePersona(id: string): Promise<void> {
    await handleResponse(
      await fetch(`/api/personas/${id}`, { method: 'DELETE' })
    )
  },

  // --- Conversation API Calls ---
  async getConversations(): Promise<Conversation[]> {
    return handleResponse(await fetch('/api/conversations'))
  },
  async getConversation(
    id: string
  ): Promise<Conversation & { messages: Message[] }> {
    return handleResponse(await fetch(`/api/conversations/${id}`))
  },
  async createConversation(data: NewConversation): Promise<Conversation> {
    return handleResponse(
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    )
  },
  async addMessages(id: string, messages: NewMessage[]): Promise<Conversation> {
    return handleResponse(
      await fetch(`/api/conversations/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      })
    )
  },
  async deleteConversation(id: string): Promise<void> {
    await handleResponse(
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
    )
  },

  // --- NEW: Orchestration API Call ---
  async orchestrate(data: OrchestrateRequest): Promise<ProviderResponse[]> {
    return handleResponse(
      await fetch('/api/llm/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    )
  },
}
