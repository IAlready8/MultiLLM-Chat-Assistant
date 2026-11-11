import Link from 'next/link'
import type { ReactNode } from 'react'

type LegalDocumentProps = {
  title: string
  lastUpdated: string
  children: ReactNode
}

export function LegalDocument({ title, lastUpdated, children }: LegalDocumentProps) {
  return (
    <article className="container mx-auto max-w-3xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated {lastUpdated}</p>
      </header>
      <div className="space-y-8 text-sm leading-relaxed">{children}</div>
      <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
        <Link className="text-primary hover:underline" href="/auth/signin">
          Back to sign in
        </Link>
      </footer>
    </article>
  )
}

type LegalSectionProps = {
  heading: string
  children: ReactNode
}

export function LegalSection({ heading, children }: LegalSectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{heading}</h2>
      {children}
    </section>
  )
}
