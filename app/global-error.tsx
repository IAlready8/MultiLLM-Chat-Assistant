'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type GlobalErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Global app error:', error)
  }, [error])

  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-lg space-y-4 text-center">
            <h2 className="text-2xl font-semibold">App failed to load</h2>
            <p className="text-muted-foreground">
              The application hit an unrecoverable startup error.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={reset}>Retry</Button>
              <Button variant="outline" asChild>
                <Link href="/">Go Home</Link>
              </Button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
