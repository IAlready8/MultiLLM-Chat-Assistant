import { getErrorMessage } from '@/lib/db-fallback'

export type SidecarDiagnostics = {
  status: 'connected' | 'degraded' | 'disabled'
  message: string
  configured: boolean
}

const sidecarHealthUrl = () => {
  const baseUrl = process.env.PYTHON_CORE_URL?.trim()
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/v1/health` : null
}

export async function getSidecarDiagnostics(
  fetchImpl: typeof fetch = fetch
): Promise<SidecarDiagnostics> {
  const sidecarUrl = sidecarHealthUrl()

  if (!sidecarUrl) {
    return {
      status: 'disabled',
      message: 'Python sidecar not configured',
      configured: false,
    }
  }

  try {
    const response = await fetchImpl(sidecarUrl, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => ({}))
    const payloadStatus = String(payload?.status || '').toLowerCase()

    if (
      response.ok &&
      (payloadStatus === 'ok' ||
        payloadStatus === 'healthy' ||
        payloadStatus === 'degraded')
    ) {
      const status = payloadStatus === 'degraded' ? 'degraded' : 'connected'
      return {
        status,
        message:
          status === 'connected'
            ? `Python sidecar responding (${payload.status})`
            : `Python sidecar reported degraded status (${payload.status})`,
        configured: true,
      }
    }

    return {
      status: 'degraded',
      message: `Python sidecar health check failed (${response.status})`,
      configured: true,
    }
  } catch (error) {
    return {
      status: 'degraded',
      message: getErrorMessage(error) || 'Python sidecar health check failed',
      configured: true,
    }
  }
}
