'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, CircleDashed, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type ChecklistState = {
  configuredProviders: number
  personas: number
  conversations: number
}

type Step = {
  id: string
  label: string
  description: string
  href: string
  complete: boolean
}

const defaultState: ChecklistState = {
  configuredProviders: 0,
  personas: 0,
  conversations: 0,
}

export function ActivationChecklist() {
  const [state, setState] = useState<ChecklistState>(defaultState)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [configResponse, personasResponse, conversationsResponse] = await Promise.all([
          fetch('/api/config', { cache: 'no-store' }),
          fetch('/api/personas', { cache: 'no-store' }),
          fetch('/api/conversations', { cache: 'no-store' }),
        ])

        const [configData, personasData, conversationsData] = await Promise.all([
          configResponse.ok ? configResponse.json() : { configuredProviders: [] },
          personasResponse.ok ? personasResponse.json() : [],
          conversationsResponse.ok ? conversationsResponse.json() : [],
        ])

        if (cancelled) return

        setState({
          configuredProviders: Array.isArray(configData?.configuredProviders)
            ? configData.configuredProviders.length
            : 0,
          personas: Array.isArray(personasData) ? personasData.length : 0,
          conversations: Array.isArray(conversationsData) ? conversationsData.length : 0,
        })
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const steps: Step[] = useMemo(
    () => [
      {
        id: 'providers',
        label: 'Configure a provider',
        description: 'Add at least one API key so the app can run real model requests.',
        href: '/settings',
        complete: state.configuredProviders > 0,
      },
      {
        id: 'personas',
        label: 'Create a persona',
        description: 'Save reusable instructions for a repeatable client workflow.',
        href: '/personas',
        complete: state.personas > 0,
      },
      {
        id: 'conversation',
        label: 'Save the first brief run',
        description: 'Run a brief in Multi-Chat and preserve the conversation for later comparison.',
        href: '/multi-chat',
        complete: state.conversations > 0,
      },
    ],
    [state]
  )

  const completedSteps = steps.filter(step => step.complete).length
  const nextStep = steps.find(step => !step.complete)

  return (
    <Card className="mb-8 w-full max-w-5xl glass-card">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Activation Checklist</CardTitle>
            <CardDescription>
              Reach the first real outcome fast: connect a provider, create a persona, and save one comparison-ready thread.
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {loading ? 'Loading progress' : `${completedSteps}/${steps.length} complete`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map(step => (
            <div
              key={step.id}
              className="rounded-xl border border-border bg-card/50 p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                {step.complete ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <CircleDashed className="h-5 w-5 text-muted-foreground" />
                )}
                <h3 className="font-medium">{step.label}</h3>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">{step.description}</p>
              <Button variant={step.complete ? 'outline' : 'default'} className="w-full" asChild>
                <Link href={step.href}>{step.complete ? 'Review' : 'Do this now'}</Link>
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium">
              {nextStep ? `Next best action: ${nextStep.label}` : 'Activation baseline complete'}
            </p>
            <p className="text-sm text-muted-foreground">
              {nextStep
                ? nextStep.description
                : 'Move into comparison and analytics to deepen repeatable usage.'}
            </p>
          </div>
          <Button asChild>
            <Link href={nextStep?.href ?? '/comparison'}>
              {nextStep ? 'Continue activation' : 'Open comparison'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
