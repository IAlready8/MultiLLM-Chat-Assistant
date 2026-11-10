'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { isPublicPagePath } from '@/lib/public-routes'
import { selectUsageNotice, type UsageNotice as Notice, type UsageSnapshot } from '@/lib/usage-notice'

const DISMISS_KEY = 'usage-notice.dismissed'

const formatReset = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'the start of next month'
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}

// One dismissal covers one state: a new month, a new level, or a payment
// problem brings the notice back.
const noticeKey = (notice: Notice): string =>
  notice.kind === 'exhausted' ? `exhausted:${notice.resetsAt}` : notice.kind

const readDismissed = (): string | null => {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

const writeDismissed = (key: string): void => {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, key)
  } catch {
    // Storage can be unavailable; the notice then simply returns next page.
  }
}

/**
 * A slim bar shown to signed-in users only when it matters: the allowance is
 * nearly used, used up, or a subscription payment failed.
 */
export function UsageNotice() {
  const { status } = useSession()
  const pathname = usePathname() || ''
  const [notice, setNotice] = useState<Notice | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)

  // The Billing page already shows all of this in full.
  const suppressed =
    status !== 'authenticated' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/billing') ||
    isPublicPagePath(pathname)

  useEffect(() => {
    if (suppressed) {
      setNotice(null)
      return
    }
    const controller = new AbortController()
    setDismissed(readDismissed())
    fetch('/api/account/usage', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => (response.ok ? ((await response.json()) as UsageSnapshot) : null))
      .then((snapshot) => setNotice(selectUsageNotice(snapshot)))
      // Never let a usage lookup failure interrupt the workspace.
      .catch(() => undefined)
    return () => controller.abort()
  }, [suppressed, pathname])

  if (suppressed || !notice || dismissed === noticeKey(notice)) return null

  const urgent = notice.kind !== 'low'
  const action =
    notice.kind === 'payment'
      ? 'Update payment details'
      : notice.canUpgrade
        ? 'Upgrade to Pro'
        : 'View plan'

  return (
    <aside
      aria-label="Plan notice"
      className={`border-b text-sm ${urgent ? 'border-destructive/40 bg-destructive/10' : 'border-border/60 bg-muted/60'}`}
    >
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
        <p>
          {notice.kind === 'payment' &&
            'Your last subscription payment did not go through. Update your payment details to keep your plan.'}
          {notice.kind === 'exhausted' && notice.limit === 0 &&
            'Your current plan does not include generations.'}
          {notice.kind === 'exhausted' && notice.limit > 0 &&
            `You have used all ${notice.limit.toLocaleString('en-US')} generations in your plan for this month. The allowance resets on ${formatReset(notice.resetsAt)}.`}
          {notice.kind === 'low' &&
            `${notice.used.toLocaleString('en-US')} of ${notice.limit.toLocaleString('en-US')} generations used this month. ${notice.remaining.toLocaleString('en-US')} left.`}
        </p>
        <div className="flex items-center gap-3">
          <Link className="font-medium text-primary hover:underline" href="/billing">
            {action}
          </Link>
          {notice.kind === 'low' ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                const key = noticeKey(notice)
                writeDismissed(key)
                setDismissed(key)
              }}
            >
              Dismiss
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
