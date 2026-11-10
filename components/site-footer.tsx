import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <nav
        aria-label="Legal"
        className="container mx-auto flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 text-xs text-muted-foreground"
      >
        <Link className="hover:text-foreground hover:underline" href="/terms">
          Terms of Service
        </Link>
        <Link className="hover:text-foreground hover:underline" href="/privacy">
          Privacy Policy
        </Link>
      </nav>
    </footer>
  )
}
