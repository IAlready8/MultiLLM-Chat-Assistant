import Link from 'next/link'

export const metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="space-y-4 text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">
          The page you requested does not exist or has moved.
        </p>
        <Link className="text-primary hover:underline" href="/">
          Back to your workspace
        </Link>
      </div>
    </div>
  )
}
