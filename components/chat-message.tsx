"use client"

/**
 * components/chat-message.tsx
 *
 * Reusable chat message display component.
 *
 * Replaces the inline message rendering blocks duplicated across:
 *   - app/multi-chat/page.tsx
 *   - app/ai-roundtable/page.tsx
 *   - app/comparison/page.tsx
 *
 * Features:
 *   - Role-specific icons and layout (user right-aligned, assistant/system left)
 *   - Provider and model badges (optional)
 *   - Streaming cursor animation when isStreaming is true
 *   - Copy-to-clipboard button with visual confirmation
 *   - Timestamp display (optional, formatted relative or absolute)
 *   - Whitespace-preserving content rendering with newline support
 *   - Graceful empty-content state
 *
 * Props:
 *   role        - "user" | "assistant" | "system"
 *   content     - The message text. Can be empty string during streaming.
 *   provider    - Optional provider ID string (e.g. "openai"). Shown as badge.
 *   model       - Optional model ID string (e.g. "gpt-4o"). Shown as badge.
 *   timestamp   - Optional Date or ISO string. Shown as tooltip-style small text.
 *   isStreaming - When true shows a blinking cursor after the last character.
 *   className   - Optional extra classes applied to the outer wrapper.
 *
 * EXISTING PAGES DO NOT NEED TO IMPORT THIS COMPONENT IMMEDIATELY.
 * It is available for adoption by any new code and future refactors.
 */

import * as React from 'react'
import { Bot, User, Terminal, Copy, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system'
  content: string
  provider?: string
  model?: string
  timestamp?: Date | string
  isStreaming?: boolean
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  googleai: 'Google AI',
  mistral: 'Mistral',
  ollama: 'Ollama',
  grok: 'Grok',
  openrouter: 'OpenRouter',
}

function formatTimestamp(ts: Date | string): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getProviderDisplayName(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider.toLowerCase()] ?? provider
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RoleIcon({ role }: { role: ChatMessageProps['role'] }) {
  const baseClass = "h-4 w-4 flex-shrink-0"
  if (role === 'user') return <User className={baseClass} />
  if (role === 'system') return <Terminal className={baseClass} />
  return <Bot className={baseClass} />
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = React.useCallback(async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API may be unavailable in some contexts
    }
  }, [text])

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
      aria-label={copied ? 'Copied' : 'Copy message'}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied
        ? <Check className="h-3 w-3 text-green-500" />
        : <Copy className="h-3 w-3 text-muted-foreground" />
      }
    </Button>
  )
}

// ---------------------------------------------------------------------------
// StreamingCursor
// ---------------------------------------------------------------------------

function StreamingCursor() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-4 w-0.5 bg-current align-middle animate-pulse"
    />
  )
}

// ---------------------------------------------------------------------------
// ChatMessage - main component
// ---------------------------------------------------------------------------

export function ChatMessage({
  role,
  content,
  provider,
  model,
  timestamp,
  isStreaming = false,
  className,
}: ChatMessageProps) {
  const isUser = role === 'user'
  const isSystem = role === 'system'

  // Paragraphs - split on double newline, preserve single newlines within
  const paragraphs = content
    ? content.split(/\n{2,}/)
    : []

  return (
    <div
      className={cn(
        "group flex w-full gap-3 py-3",
        isUser ? "flex-row-reverse" : "flex-row",
        className,
      )}
    >
      {/* Role icon avatar */}
      <div
        className={cn(
          "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border text-xs font-medium",
          isUser
            ? "bg-primary text-primary-foreground border-primary"
            : isSystem
              ? "bg-orange-500/10 text-orange-500 border-orange-500/30"
              : "bg-secondary text-secondary-foreground border-border",
        )}
        aria-label={`${role} message`}
      >
        <RoleIcon role={role} />
      </div>

      {/* Message body */}
      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-1.5",
          isUser ? "items-end" : "items-start",
        )}
      >
        {/* Header row: provider/model badges + copy button */}
        {(provider || model || !isUser) && (
          <div
            className={cn(
              "flex items-center gap-1.5 flex-wrap",
              isUser ? "flex-row-reverse" : "flex-row",
            )}
          >
            {provider && (
              <Badge
                variant="outline"
                className="h-4 px-1.5 text-[10px] font-normal text-muted-foreground"
              >
                {getProviderDisplayName(provider)}
              </Badge>
            )}
            {model && (
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[10px] font-normal"
              >
                {model}
              </Badge>
            )}
            {isSystem && (
              <Badge
                variant="outline"
                className="h-4 px-1.5 text-[10px] font-normal border-orange-500/30 text-orange-500"
              >
                system
              </Badge>
            )}
          </div>
        )}

        {/* Content bubble */}
        <div
          className={cn(
            "relative rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : isSystem
                ? "bg-orange-500/5 text-foreground border border-orange-500/20 rounded-tl-sm"
                : "bg-muted text-foreground rounded-tl-sm",
          )}
        >
          {/* Text content */}
          {paragraphs.length > 0 ? (
            paragraphs.map((para, i) => (
              <p
                key={i}
                className={cn("whitespace-pre-wrap break-words", i > 0 && "mt-3")}
              >
                {para}
              </p>
            ))
          ) : (
            <span className="whitespace-pre-wrap break-words">{content}</span>
          )}

          {/* Streaming cursor appended after last character */}
          {isStreaming && <StreamingCursor />}

          {/* Copy button - shows on hover of the group */}
          {!isStreaming && content && (
            <div
              className={cn(
                "absolute -top-2 flex",
                isUser ? "left-1" : "right-1",
              )}
            >
              <CopyButton text={content} />
            </div>
          )}
        </div>

        {/* Timestamp */}
        {timestamp && (
          <span
            className="text-[10px] text-muted-foreground px-1"
            title={
              timestamp instanceof Date
                ? timestamp.toLocaleString()
                : new Date(timestamp).toLocaleString()
            }
          >
            {formatTimestamp(timestamp)}
          </span>
        )}
      </div>
    </div>
  )
}

export default ChatMessage
