import Link from 'next/link'

/** Shown wherever an account can be created or entered. */
export function LegalConsentNotice() {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      By continuing, you agree to the{' '}
      <Link className="text-primary hover:underline" href="/terms">
        Terms of Service
      </Link>{' '}
      and acknowledge the{' '}
      <Link className="text-primary hover:underline" href="/privacy">
        Privacy Policy
      </Link>
      .
    </p>
  )
}
