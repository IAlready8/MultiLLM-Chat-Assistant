import { spawnSync } from 'node:child_process'

export function previewMigrationUrl(env) {
  const expectedHost = env.PREVIEW_MIGRATION_HOST
  if (!expectedHost || env.VERCEL_ENV !== 'preview') return null
  if (!env.PREVIEW_MIGRATION_BRANCH || env.VERCEL_GIT_COMMIT_REF !== env.PREVIEW_MIGRATION_BRANCH) {
    throw new Error('Preview migration branch does not match the configured branch')
  }
  const raw = env.DATABASE_URL || env.POSTGRES_DATABASE_URL
  const url = new URL(raw)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== expectedHost) {
    throw new Error('Preview migration database does not match the configured staging host')
  }
  return raw
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const databaseUrl = previewMigrationUrl(process.env)
  if (databaseUrl) {
    console.info('Applying committed migrations to the verified preview database')
    const result = spawnSync('npx', ['--no-install', 'prisma', 'migrate', 'deploy'], {
      stdio: 'inherit', env: { ...process.env, DATABASE_URL: databaseUrl },
    })
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' })
  process.exit(build.status ?? 1)
}
