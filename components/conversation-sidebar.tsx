'use client'

/**
 * ConversationSidebar - Displays conversation history with search and actions.
 *
 * Shows all user conversations sorted by most recent. Supports:
 * - Text search (filters by title client-side)
 * - Load a conversation by clicking it
 * - Delete a conversation with confirmation
 * - Create a new conversation
 * - Collapsible on mobile via toggle button
 *
 * USAGE:
 *   import { ConversationSidebar } from '@/components/conversation-sidebar'
 *   <ConversationSidebar
 *     activeId={activeConversationId}
 *     onSelect={(id) => loadConversation(id)}
 *     onNew={() => clearChat()}
 *     onDelete={(id) => deleteConversation(id)}
 *   />
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  MessageSquare,
  Plus,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react'

interface ConversationMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

interface ConversationSidebarProps {
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  isLoading?: boolean
}

export function ConversationSidebar({
  activeId,
  onSelect,
  onNew,
  onDelete,
  isLoading = false,
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<ConversationMeta[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(true)
  const [isFetching, setIsFetching] = useState(true)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const deleteTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch conversation list
  const fetchConversations = useCallback(async () => {
    try {
      setIsFetching(true)
      const response = await fetch('/api/conversations', { cache: 'no-store' })
      if (!response.ok) {
        console.error('Failed to fetch conversations:', response.status)
        return
      }
      const data: ConversationMeta[] = await response.json()
      setConversations(data)
    } catch (error) {
      console.error('Failed to fetch conversations:', error)
    } finally {
      setIsFetching(false)
    }
  }, [])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // Refresh list when activeId changes (new conversation created)
  useEffect(() => {
    if (activeId) {
      fetchConversations()
    }
  }, [activeId, fetchConversations])

  // Filter by search query
  const filtered = searchQuery.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations

  // Format relative time
  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHr / 24)

    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHr < 24) return `${diffHr}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Handle delete with confirmation
  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()

    if (deleteConfirmId === id) {
      // Second click = confirm delete
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current)
        deleteTimerRef.current = null
      }
      setDeleteConfirmId(null)
      onDelete(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
    } else {
      // First click = show confirm state
      setDeleteConfirmId(id)
      // Auto-reset after 3 seconds
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current)
      }
      deleteTimerRef.current = setTimeout(() => {
        setDeleteConfirmId(null)
        deleteTimerRef.current = null
      }, 3000)
    }
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current)
      }
    }
  }, [])

  // Collapsed state: just show toggle button
  if (!isOpen) {
    return (
      <div className="flex flex-col items-center py-4 px-1 border-r border-border bg-card/50 w-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="h-8 w-8 p-0 mb-4"
          aria-label="Open conversation sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNew}
          className="h-8 w-8 p-0"
          aria-label="New conversation"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-64 border-r border-border bg-card/50 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <span className="text-sm font-semibold">Conversations</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onNew}
            className="h-7 w-7 p-0"
            aria-label="New conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="h-7 w-7 p-0"
            aria-label="Close sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="pl-7 h-8 text-xs"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {isFetching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 px-2">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">
              {searchQuery ? 'No matching conversations' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          filtered.map((conversation) => {
            const isActive = conversation.id === activeId
            const isConfirmingDelete = deleteConfirmId === conversation.id
            return (
              <div
                key={conversation.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(conversation.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(conversation.id)
                  }
                }}
                className={`group flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer transition-colors text-sm ${
                  isActive
                    ? 'bg-primary/10 text-foreground border border-primary/20'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs font-medium">
                    {conversation.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {formatTime(conversation.updatedAt)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleDeleteClick(e, conversation.id)}
                  className={`h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1 ${
                    isConfirmingDelete
                      ? 'opacity-100 text-destructive hover:text-destructive'
                      : ''
                  }`}
                  aria-label={
                    isConfirmingDelete
                      ? 'Click again to confirm delete'
                      : 'Delete conversation'
                  }
                  disabled={isLoading}
                >
                  <Trash2
                    className={`h-3.5 w-3.5 ${
                      isConfirmingDelete ? 'text-destructive' : ''
                    }`}
                  />
                </Button>
              </div>
            )
          })
        )}
      </div>

      {/* Footer: count */}
      <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
        {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

export default ConversationSidebar
