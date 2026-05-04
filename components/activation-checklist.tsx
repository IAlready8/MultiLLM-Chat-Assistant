'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, CircleDashed, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { loadComparisonSessions } from '@/services/comparison-session-storage'

type ChecklistState = {
  configuredProviders: number
  personas: number
  comparisonReadyConversations: number
  comparisonSessions: number
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
  comparisonReadyConversations: 0,
  comparisonSessions: 0,
}

export function ActivationChecklist() {
  const [state, setState] = useState<ChecklistState>(defaultState)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const abortController = new AbortController()
    const { signal } = abortController

    const load = async () => {
      try {
        setLoadError(null)
        const response = await fetch('/api/activation-state', {
          cache: 'no-store',
          signal,
        })

        if (!response.ok) {
          throw new Error(`Failed to load activation state (${response.status})`)
        }

        const data = (await response.json()) as ChecklistState

        setState({
          configuredProviders: typeof data.configuredProviders === 'number' ? data.configuredProviders : 0,
          personas: typeof data.personas === 'number' ? data.personas : 0,
          comparisonReadyConversations:
            typeof data.comparisonReadyConversations === 'number'
              ? data.comparisonReadyConversations
              : 0,
          comparisonSessions: loadComparisonSessions().length,
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }

        console.error('Failed to load activation checklist:', error)
        setLoadError('Unable to load activation progress right now.')
      } finally {
        if (!signal.aborted) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      abortController.abort()
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
        label: 'Save the first conversation',
        description:
          'Save one conversation with at least one real provider response so comparison and analytics have something to build on.',
        href: '/multi-chat',
        complete: state.comparisonReadyConversations > 0,
      },
      {
        id: 'comparison',
        label: 'Save a comparison session',
        description:
          'Snapshot the best multi-response thread so comparison work has an explicit saved artifact.',
        href: '/comparison',
        complete: state.comparisonSessions > 0,
      },
      {
        id: 'analytics',
        label: 'Review analytics',
        description:
          'Check usage, latency, and provider patterns after the first saved comparison.',
        href: '/analytics',
        complete: state.comparisonSessions > 0,
      },
    ],
    [state]
  )

  const completedSteps = steps.filter(step => step.complete).length
  const nextStep = steps.find(step => !step.complete)
  const statusLabel = loading
    ? 'Loading progress'
    : loadError
      ? 'Progress unavailable'
      : `${completedSteps}/${steps.length} complete`
  const summaryTitle = loading
    ? 'Checking your current setup'
    : loadError
      ? 'Could not load activation status'
    : nextStep
      ? `Next best action: ${nextStep.label}`
      : 'Activation baseline complete'
  const summaryDescription = loading
    ? 'We are checking providers, personas, saved comparison-ready conversations, and comparison sessions now.'
    : loadError
      ? 'Your progress could not be loaded. Review your setup manually and continue from there.'
    : nextStep
      ? nextStep.description
      : 'Move into comparison and analytics to deepen repeatable usage.'

  return (
    <Card className="mb-8 w-full max-w-5xl glass-card" aria-busy={loading}>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Activation Checklist</CardTitle>
            <CardDescription>
              Follow the finished path: Settings, Personas, Multi-Chat, Comparison, then Analytics.
            </CardDescription>
          </div>
          <Badge variant="secondary" aria-live="polite">
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
              {loading || loadError ? (
                <Button variant="outline" className="w-full" disabled>
                  {loading ? 'Checking setup' : 'Status unavailable'}
                </Button>
              ) : (
                <Button variant={step.complete ? 'outline' : 'default'} className="w-full" asChild>
                  <Link href={step.href}>{step.complete ? 'Review' : 'Do this now'}</Link>
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-medium" aria-live="polite">
              {summaryTitle}
            </p>
            <p className="text-sm text-muted-foreground">{summaryDescription}</p>
            {loadError ? (
              <p className="mt-1 text-sm text-destructive" role="status">
                {loadError}
              </p>
            ) : null}
          </div>
          {loading ? (
            <Button disabled>
              Checking progress
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : loadError ? (
            <Button asChild variant="outline">
              <Link href="/settings">
                Review setup
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href={nextStep?.href ?? '/comparison'}>
                {nextStep ? 'Continue activation' : 'Open comparison'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
