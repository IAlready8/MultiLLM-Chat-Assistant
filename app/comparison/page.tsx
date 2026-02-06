'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'

interface ModelComparison {
  id: string
  name: string
  provider: string
  responseTime: number // in ms
  tokensPerSecond: number
  accuracy: number // percentage
  cost: number // in USD
  usageCount: number
}

export default function ComparisonPage() {
  const comparisonData = useMemo<ModelComparison[]>(() => [
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      provider: 'OpenAI',
      responseTime: 850,
      tokensPerSecond: 120,
      accuracy: 94.5,
      cost: 0.03,
      usageCount: 124
    },
    {
      id: 'claude-3-opus',
      name: 'Claude 3 Opus',
      provider: 'Anthropic',
      responseTime: 1200,
      tokensPerSecond: 95,
      accuracy: 96.2,
      cost: 0.015,
      usageCount: 89
    },
    {
      id: 'gemini-pro',
      name: 'Gemini Pro',
      provider: 'Google',
      responseTime: 650,
      tokensPerSecond: 140,
      accuracy: 92.1,
      cost: 0.001,
      usageCount: 201
    },
    {
      id: 'llama-2-70b',
      name: 'Llama 2 70B',
      provider: 'Meta',
      responseTime: 1100,
      tokensPerSecond: 75,
      accuracy: 89.3,
      cost: 0.002,
      usageCount: 67
    }
  ], [])
  const [activeTab, setActiveTab] = useState('models')

  const renderModelComparison = () => (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
        {comparisonData.map((model) => (
          <Card key={model.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{model.name}</CardTitle>
                <Badge variant="outline">{model.provider}</Badge>
              </div>
              <CardDescription>{model.id}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Response Time</span>
                  <span className="text-sm font-medium">{model.responseTime}ms</span>
                </div>
                <Progress value={(1 - model.responseTime / 2000) * 100} className="h-2" />
                
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Tokens/Sec</span>
                  <span className="text-sm font-medium">{model.tokensPerSecond}</span>
                </div>
                <Progress value={(model.tokensPerSecond / 200) * 100} className="h-2" />
                
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Accuracy</span>
                  <span className="text-sm font-medium">{model.accuracy}%</span>
                </div>
                <Progress value={model.accuracy} className="h-2" />
                
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Cost per 1K tokens</span>
                  <span className="text-sm font-medium">${model.cost.toFixed(4)}</span>
                </div>
                
                <div className="flex justify-between pt-2">
                  <span className="text-sm text-muted-foreground">Usage Count</span>
                  <span className="text-sm font-medium">{model.usageCount}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Overall Comparison</CardTitle>
          <CardDescription>Side-by-side comparison of model performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Model</th>
                  <th className="text-left py-2">Provider</th>
                  <th className="text-left py-2">Response Time</th>
                  <th className="text-left py-2">Tokens/Sec</th>
                  <th className="text-left py-2">Accuracy</th>
                  <th className="text-left py-2">Cost (1K tokens)</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((model) => (
                  <tr key={model.id} className="border-b">
                    <td className="py-2 font-medium">{model.name}</td>
                    <td className="py-2">{model.provider}</td>
                    <td className="py-2">{model.responseTime}ms</td>
                    <td className="py-2">{model.tokensPerSecond}</td>
                    <td className="py-2">{model.accuracy}%</td>
                    <td className="py-2">${model.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderConversationComparison = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Conversation Comparison</CardTitle>
          <CardDescription>Compare responses from different models on the same prompt</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="font-medium mb-2">Prompt</h3>
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                &ldquo;Explain quantum computing in simple terms&rdquo;
              </p>
            </div>
            <div className="space-y-4">
              {['GPT-4 Turbo', 'Claude 3 Opus', 'Gemini Pro'].map((model, index) => (
                <div key={index} className="border rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-medium">{model}</h4>
                    <Badge variant="outline">Provider</Badge>
                  </div>
                  <p className="text-sm">
                    Quantum computing leverages quantum mechanics principles like superposition and entanglement to process information in ways classical computers cannot. Instead of bits that are 0 or 1, quantum computers use quantum bits (qubits) that can exist in multiple states simultaneously, enabling parallel computation on a massive scale.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">Model Comparison</h1>
          <Badge variant="secondary">Demo data</Badge>
        </div>
        <p className="text-muted-foreground mt-2">
          Compare performance metrics and sample responses across providers.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="models">Model Metrics</TabsTrigger>
          <TabsTrigger value="conversations">Response Comparison</TabsTrigger>
        </TabsList>
        
        <TabsContent value="models" className="space-y-4">
          {renderModelComparison()}
        </TabsContent>
        
        <TabsContent value="conversations" className="space-y-4">
          {renderConversationComparison()}
        </TabsContent>
      </Tabs>
    </div>
  )
}
