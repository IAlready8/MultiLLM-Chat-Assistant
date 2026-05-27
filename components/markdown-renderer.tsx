'use client'

/**
 * MarkdownRenderer - Renders AI responses as formatted markdown.
 *
 * Uses react-markdown with remark-gfm for GitHub Flavored Markdown.
 * Provides syntax-highlighted code blocks with a copy button,
 * styled tables, proper link handling, and clean typography.
 *
 * INSTALL REQUIRED:
 *   npm install react-markdown remark-gfm
 *
 * USAGE:
 *   import { MarkdownRenderer } from '@/components/markdown-renderer'
 *   <MarkdownRenderer content={message.content} />
 */

import { useState, useCallback, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ---- Copy Button for code blocks ----
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-muted hover:bg-muted/80 text-muted-foreground border border-border transition-colors"
      aria-label={copied ? 'Copied' : 'Copy code'}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ---- Custom renderers for react-markdown ----
const markdownComponents = {
  // Fenced code blocks with language label and copy button
  code({
    inline,
    className,
    children,
    ...props
  }: {
    inline?: boolean
    className?: string
    children?: React.ReactNode
    [key: string]: unknown
  }) {
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1] : ''
    const codeString = String(children).replace(/\n$/, '')

    if (!inline && (language || codeString.includes('\n'))) {
      return (
        <div className="relative group my-3">
          {language && (
            <div className="flex items-center justify-between px-4 py-1.5 bg-muted/60 border border-b-0 border-border rounded-t-md">
              <span className="text-xs text-muted-foreground font-mono">{language}</span>
            </div>
          )}
          <div className="relative">
            <CopyButton text={codeString} />
            <pre
              className={`overflow-x-auto p-4 bg-muted/40 border border-border text-sm font-mono leading-relaxed ${
                language ? 'rounded-b-md' : 'rounded-md'
              }`}
            >
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          </div>
        </div>
      )
    }

    // Inline code
    return (
      <code
        className="px-1.5 py-0.5 rounded bg-muted/60 border border-border text-sm font-mono"
        {...props}
      >
        {children}
      </code>
    )
  },

  // Paragraphs
  p({ children }: { children?: React.ReactNode }) {
    return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
  },

  // Headings
  h1({ children }: { children?: React.ReactNode }) {
    return <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0">{children}</h1>
  },
  h2({ children }: { children?: React.ReactNode }) {
    return <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h2>
  },
  h3({ children }: { children?: React.ReactNode }) {
    return <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h3>
  },

  // Lists
  ul({ children }: { children?: React.ReactNode }) {
    return <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>
  },
  ol({ children }: { children?: React.ReactNode }) {
    return <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>
  },
  li({ children }: { children?: React.ReactNode }) {
    return <li className="leading-relaxed">{children}</li>
  },

  // Links (open external in new tab)
  a({ href, children }: { href?: string; children?: React.ReactNode }) {
    const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'))
    return (
      <a
        href={href}
        className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
      >
        {children}
      </a>
    )
  },

  // Blockquotes
  blockquote({ children }: { children?: React.ReactNode }) {
    return (
      <blockquote className="border-l-4 border-primary/40 pl-4 my-3 text-muted-foreground italic">
        {children}
      </blockquote>
    )
  },

  // Tables
  table({ children }: { children?: React.ReactNode }) {
    return (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full border border-border rounded-md text-sm">
          {children}
        </table>
      </div>
    )
  },
  thead({ children }: { children?: React.ReactNode }) {
    return <thead className="bg-muted/50">{children}</thead>
  },
  th({ children }: { children?: React.ReactNode }) {
    return (
      <th className="px-3 py-2 text-left font-semibold border-b border-border">
        {children}
      </th>
    )
  },
  td({ children }: { children?: React.ReactNode }) {
    return (
      <td className="px-3 py-2 border-b border-border">{children}</td>
    )
  },

  // Horizontal rule
  hr() {
    return <hr className="my-4 border-border" />
  },

  // Strong and emphasis
  strong({ children }: { children?: React.ReactNode }) {
    return <strong className="font-semibold">{children}</strong>
  },
  em({ children }: { children?: React.ReactNode }) {
    return <em className="italic">{children}</em>
  },
}

// ---- Main Component ----
interface MarkdownRendererProps {
  content: string
  className?: string
}

function MarkdownRendererInner({ content, className = '' }: MarkdownRendererProps) {
  // If content looks like plain text with no markdown indicators, render simply
  const hasMarkdown = /[#*`|>\[\]!_~-]/.test(content)

  if (!hasMarkdown && !content.includes('\n\n')) {
    return <div className={`whitespace-pre-wrap ${className}`}>{content}</div>
  }

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents as any}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export const MarkdownRenderer = memo(MarkdownRendererInner)
export default MarkdownRenderer
