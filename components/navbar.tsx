'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MobileMenu } from '@/components/mobile-menu'
import { SignOutButton } from '@/components/sign-out-button'

export default function Navbar() {
  const pathname = usePathname()

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'Multi-Chat', path: '/multi-chat' },
    { name: 'Comparison', path: '/comparison' },
    { name: 'AI Roundtable', path: '/ai-roundtable' },
    { name: 'Goal Hub', path: '/goal-hub' },
    { name: 'Pipeline', path: '/pipeline' },
    { name: 'Personas', path: '/personas' },
    { name: 'Analytics', path: '/analytics' },
    { name: 'Settings', path: '/settings' },
  ]

  return (
    <nav className="border-b border-border/60 bg-background/80 backdrop-blur-lg">
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-xl font-bold tracking-tight rainbow-text">
          MultiLLM
        </Link>
        <div className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              data-active={pathname === item.path ? 'true' : 'false'}
              aria-current={pathname === item.path ? 'page' : undefined}
              className={`nav-rainbow-link relative px-4 py-2 rounded-lg transition-all smooth-transition ${
                pathname === item.path
                  ? 'text-foreground font-medium bg-card/80 border border-border shadow-sm rainbow-outline-hover'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
              }`}
            >
              {item.name}
            </Link>
          ))}
          <SignOutButton className="ml-1 shrink-0" />
        </div>
        <MobileMenu items={navItems} />
      </div>
    </nav>
  )
}
