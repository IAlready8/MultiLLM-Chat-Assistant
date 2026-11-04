import Link from 'next/link'

export function PublicFooter() {
  return (
    <footer className="border-t border-border px-4 py-6 text-sm text-muted-foreground">
      <nav aria-label="Product and legal" className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-3">
        <Link href="/pricing">Pricing and allowances</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/support">Support</Link>
      </nav>
    </footer>
  )
}
