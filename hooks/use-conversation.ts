import { useState, useEffect, useCallback } from 'react'
import { Conversation, Message } from '@/types/prisma'
import { apiClient } from '@/lib/api-client'

type FullConversation = Conversation & { messages: Message[] }
type NewMessage = Omit<Message, 'id' | 'conversationId' | 'createdAt'>

/**
 * Refactored hook for managing conversations.
 * - Replaces 'IndexedDB' with server-side API calls.
 * - Manages both the list of conversations and the active one.
 */
export const useConversation = () => {
  const [conversationList, setConversationList] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] =
    useState<FullConversation | null>(null)
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // 1. Fetch initial conversation list (metadata only)
  useEffect(() => {
    const fetchList = async () => {
      try {
        setIsLoadingList(true)
        const data = await apiClient.getConversations()
        setConversationList(data)
        setError(null)
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoadingList(false)
      }
    }
    fetchList()
  }, [])

  // 2. Load a specific, full conversation
  const loadConversation = useCallback(async (id: string) => {
    try {
      setIsLoadingMessages(true)
      const data = await apiClient.getConversation(id)
      setActiveConversation(data)
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoadingMessages(false)
    }
  }, [])

  // 3. Create a new conversation
  const createConversation = useCallback(
    async (title: string, messages: NewMessage[]) => {
      try {
        setIsLoadingMessages(true)
        const newConvo = await apiClient.createConversation({ title, messages })
        
        // Add to list and set as active
        setConversationList((prev) => [newConvo, ...prev])
        // We need the full messages, so we fetch the full convo
        await loadConversation(newConvo.id) 
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoadingMessages(false)
      }
    },
    [loadConversation]
  )

  // 4. Add messages to an existing conversation
  const addMessages = useCallback(
    async (messages: NewMessage[]) => {
      if (!activeConversation) return

      const convoId = activeConversation.id

      // Optimistic update for messages
      const optimisticMessages: Message[] = messages.map((msg, i) => ({
        ...msg,
        id: `temp-msg-${Date.now()}-${i}`,
        conversationId: convoId,
        createdAt: new Date(),
      }))
      
      setActiveConversation((prev: FullConversation | null) =>
        prev ? { ...prev, messages: [...prev.messages, ...optimisticMessages] } : null
      )

      try {
        // Real API call
        const updatedConvo = await apiClient.addMessages(convoId, messages) as FullConversation
        // Replace optimistic state with server state
        setActiveConversation(updatedConvo)

        // Update the 'updatedAt' in the list
        setConversationList(prev =>
          prev.map(c => c.id === convoId ? { ...c, updatedAt: updatedConvo.updatedAt } : c)
        )
      } catch (err) {
        setError(err as Error)
        // Rollback optimistic update
        await loadConversation(convoId) // Re-fetch to be safe
      }
    },
    [activeConversation, loadConversation]
  )
  
  // 5. Delete a conversation
  const deleteConversation = useCallback(async (id: string) => {
    const originalList = [...conversationList]
    
    // Optimistic update
    setConversationList(prev => prev.filter(c => c.id !== id))
    if(activeConversation?.id === id) {
      setActiveConversation(null)
    }
    
    try {
      await apiClient.deleteConversation(id)
    } catch(err) {
      setError(err as Error)
      // Rollback
      setConversationList(originalList)
    }
  }, [activeConversation, conversationList])
  
  // 6. Clear active conversation (to go back to list view)
  const clearActiveConversation = useCallback(() => {
    setActiveConversation(null)
  }, [])

  return {
    conversationList,
    activeConversation,
    isLoadingList,
    isLoadingMessages,
    error,
    loadConversation,
    createConversation,
    addMessages,
    deleteConversation,
    clearActiveConversation
  }
}
