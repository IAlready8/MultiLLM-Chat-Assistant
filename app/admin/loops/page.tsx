'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Play,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type LoopTerminalState =
  | 'COMPLETE'
  | 'BLOCKED'
  | 'MAX_ITERATIONS'
  | 'BUDGET_EXCEEDED'
  | 'VERIFICATION_FAILED'

type LoopVerifierResult = {
  verdict: 'ACCEPT' | 'REJECT' | 'BLOCKED'
  failedGate?: string
  evidence: string[]
  requiredFix?: string
}

type LoopRunResponse = {
  runId: string
  loopId: string
  finalState: LoopTerminalState
  iterations: number
  tokenUsage: number
  estimatedCostUsd: number
  summary: string
  lastVerifierResult?: LoopVerifierResult
}

type LoopRunSummary = {
  runId: string
  loopId: string
  status: string
  startedAt: string
  completedAt?: string
  iterations: number
  tokenUsage: number
  estimatedCostUsd: number
  summary?: string
}

type RecentRunsResponse = {
  source: 'loop-event-ledger'
  runs: LoopRunSummary[]
}

const statusVariant = (
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'COMPLETE' || status === 'ACCEPT') {
    return 'default'
  }
  if (status === 'BLOCKED' || status === 'VERIFICATION_FAILED') {
    return 'destructive'
  }
  if (status === 'RUNNING' || status === 'MAX_ITERATIONS') {
    return 'secondary'
  }
  return 'outline'
}

const formatDateTime = (value?: string): string => {
  if (!value) {
    return 'Pending'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const formatCost = (value: number): string =>
  value === 0 ? '$0.00' : `$${value.toFixed(4)}`

export default function AdminLoopsPage() {
  const [runs, setRuns] = useState<LoopRunSummary[]>([])
  const [latestResult, setLatestResult] = useState<LoopRunResponse | null>(null)
  const [isLoadingRuns, setIsLoadingRuns] = useState(true)
  const [isRunningAudit, setIsRunningAudit] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRuns = useCallback(async () => {
    setIsLoadingRuns(true)
    setError(null)

    try {
      const response = await fetch(
        '/api/admin/loops/runs?loopId=provider-registry-audit&limit=10&days=30',
        { cache: 'no-store' }
      )
      const payload = (await response.json()) as Partial<RecentRunsResponse>

      if (!response.ok || !Array.isArray(payload.runs)) {
        throw new Error(`Failed to load loop runs (${response.status})`)
      }

      setRuns(payload.runs)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load loop runs'
      )
    } finally {
      setIsLoadingRuns(false)
    }
  }, [])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  const runProviderAudit = async () => {
    setIsRunningAudit(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/loops/provider-registry-audit', {
        method: 'POST',
        cache: 'no-store',
      })
      const payload = (await response.json()) as Partial<LoopRunResponse>

      if (!payload.runId || !payload.finalState) {
        throw new Error(`Provider audit failed (${response.status})`)
      }

      const result = payload as LoopRunResponse
      setLatestResult(result)
      await loadRuns()
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : 'Provider audit failed'
      )
    } finally {
      setIsRunningAudit(false)
    }
  }

  const latestVerdict = latestResult?.lastVerifierResult?.verdict
  const resultIcon = useMemo(() => {
    if (!latestResult) {
      return ShieldCheck
    }
    if (latestResult.finalState === 'COMPLETE') {
      return CheckCircle
    }
    if (
      latestResult.finalState === 'BLOCKED' ||
      latestResult.finalState === 'VERIFICATION_FAILED'
    ) {
      return XCircle
    }
    return Clock
  }, [latestResult])

  const ResultIcon = resultIcon

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Loop Controls</h1>
            <Badge variant="secondary">Admin</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Run provider registry verification and inspect recent bounded loop runs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={runProviderAudit}
            disabled={isRunningAudit}
          >
            {isRunningAudit ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Run audit
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={loadRuns}
            disabled={isLoadingRuns}
            aria-label="Refresh loop runs"
            title="Refresh loop runs"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoadingRuns ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>

      {error && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Loop controls unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ResultIcon className="h-5 w-5" />
                Provider Registry Audit
              </CardTitle>
              <CardDescription>
                Verifies provider metadata, adapters, model catalog, and rate limits.
              </CardDescription>
            </div>
            <Badge variant={statusVariant(latestResult?.finalState ?? 'READY')}>
              {latestResult?.finalState ?? 'READY'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {latestResult ? (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Iterations</div>
                  <div className="text-lg font-semibold">
                    {latestResult.iterations}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Tokens</div>
                  <div className="text-lg font-semibold">
                    {latestResult.tokenUsage}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Cost</div>
                  <div className="text-lg font-semibold">
                    {formatCost(latestResult.estimatedCostUsd)}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Verifier</div>
                  <div className="text-lg font-semibold">
                    {latestVerdict ?? 'Not run'}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-1 text-sm font-medium">Summary</div>
                <p className="text-sm text-muted-foreground">
                  {latestResult.summary}
                </p>
              </div>

              {latestResult.lastVerifierResult && (
                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">Verifier result</span>
                    <Badge
                      variant={statusVariant(
                        latestResult.lastVerifierResult.verdict
                      )}
                    >
                      {latestResult.lastVerifierResult.verdict}
                    </Badge>
                    {latestResult.lastVerifierResult.failedGate && (
                      <Badge variant="outline">
                        {latestResult.lastVerifierResult.failedGate}
                      </Badge>
                    )}
                  </div>

                  {latestResult.lastVerifierResult.evidence.length > 0 && (
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {latestResult.lastVerifierResult.evidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}

                  {latestResult.lastVerifierResult.requiredFix && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Required fix</AlertTitle>
                      <AlertDescription>
                        {latestResult.lastVerifierResult.requiredFix}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No audit result in this browser session.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
          <CardDescription>
            Last 10 provider registry audit runs recorded in the loop event ledger.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingRuns && runs.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Loading runs...
            </div>
          ) : runs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No provider registry audit runs found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-3 pr-4 font-medium">Started</th>
                    <th className="py-3 pr-4 font-medium">Completed</th>
                    <th className="py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 pr-4 font-medium">Iterations</th>
                    <th className="py-3 pr-4 font-medium">Tokens</th>
                    <th className="py-3 pr-4 font-medium">Cost</th>
                    <th className="py-3 font-medium">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.runId} className="border-b last:border-b-0">
                      <td className="py-3 pr-4">{formatDateTime(run.startedAt)}</td>
                      <td className="py-3 pr-4">
                        {formatDateTime(run.completedAt)}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={statusVariant(run.status)}>
                          {run.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">{run.iterations}</td>
                      <td className="py-3 pr-4">{run.tokenUsage}</td>
                      <td className="py-3 pr-4">
                        {formatCost(run.estimatedCostUsd)}
                      </td>
                      <td className="max-w-[280px] truncate py-3">
                        {run.summary ?? 'No summary'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
