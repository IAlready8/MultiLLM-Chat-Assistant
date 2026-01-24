'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api-client'

// This type should be imported from a shared types file
type ProviderResponse = {
  provider: string
  model: string
  content: string
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  latency_ms: number
}

// This component demonstrates how to use the orchestration service
export default function PipelinePage() {
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ProviderResponse[]>([])

  const handleUseSample = () => {
    setPrompt('Draft a product launch plan for a multi-model AI assistant.')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return

    setIsLoading(true)
    setError(null)
    setResults([])

    // Define the multi-provider request
    const orchestrationRequest = {
      prompt: prompt,
      requests: [
        {
          provider: 'openai',
          model: 'gpt-4-turbo',
          prompt: prompt, // The Python service can override this with the main prompt
        },
        {
          provider: 'anthropic',
          model: 'claude-3-opus-20240229',
          prompt: prompt,
        },
        {
          provider: 'googleai',
          model: 'gemini-1.5-pro',
          prompt: prompt,
        },
      ],
    }

    try {
      const data = await apiClient.orchestrate(orchestrationRequest)
      setResults(data)
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>LLM Orchestration Pipeline</CardTitle>
            <Badge variant="secondary">Experimental</Badge>
          </div>
          <p className="text-muted-foreground">
            Send one prompt to multiple providers via the Python Core service.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt here..."
              className="min-h-[150px]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Processing...' : 'Run Orchestration'}
              </Button>
              <Button type="button" variant="outline" onClick={handleUseSample} disabled={isLoading}>
                Use sample prompt
              </Button>
            </div>
          </form>

          {error && (
            <div className="mt-4 text-red-500">
              <p>
                <strong>Error:</strong> {error}
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div className="mt-6 space-y-4">
              <h3 className="text-lg font-semibold">Results</h3>
              {results.map((res, index) => (
                <Card key={index} className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-base">
                      {res.provider} ({res.model})
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Latency: {res.latency_ms}ms | Cost: ${res.cost_usd.toFixed(6)}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <p>{res.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
