// Operator tool: issue a single-use password reset link for an existing
// password account after verifying the requester out of band (for example a
// request sent from the account's own email address to the support mailbox).
//
// Usage (macOS zsh; the database URL is read with hidden input, never typed
// on the command line):
//   printf 'DATABASE_URL (hidden): '; read -rs DATABASE_URL; echo; export DATABASE_URL
//   node scripts/issue-password-reset.mjs --email person@example.com --origin https://your-app.example
//   unset DATABASE_URL
//
// The link is copied to the clipboard with pbcopy. Pass --print to write it to
// stdout instead (for systems without pbcopy). Send it only to the account's
// email address. It expires after 60 minutes and works once.
import { createHash, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const RECOVERY_IDENTIFIER_PREFIX = 'password-reset:'
export const RECOVERY_TOKEN_TTL_MS = 60 * 60 * 1000

// The input is a 256-bit random token, not a user password; SHA-256 is the
// appropriate storage hash for it.
export const hashRecoveryToken = (token) =>
  createHash('sha256').update(token, 'utf8').digest('hex')

export function normaliseOrigin(raw) {
  let url
  try { url = new URL(String(raw ?? '')) } catch { throw new Error('--origin must be an absolute URL') }
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !local) throw new Error('--origin must use https')
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('--origin must not include a path, query or fragment')
  return url.origin
}

/** Returns { ok: true, url, expires } or { ok: false, reason } (operator-only output). */
export async function issueRecoveryLink(prisma, { email, origin, now = new Date() }) {
  const normalisedEmail = String(email ?? '').trim().toLowerCase()
  if (!normalisedEmail.includes('@')) return { ok: false, reason: 'invalid-email' }
  const base = normaliseOrigin(origin)
  const user = await prisma.user.findUnique({
    where: { email: normalisedEmail },
    select: { id: true, password: true, deletionRequestedAt: true },
  })
  if (!user) return { ok: false, reason: 'no-account' }
  if (!user.password) return { ok: false, reason: 'not-a-password-account' }
  if (user.deletionRequestedAt) return { ok: false, reason: 'deletion-pending' }

  const token = randomBytes(32).toString('base64url')
  const identifier = `${RECOVERY_IDENTIFIER_PREFIX}${user.id}`
  const expires = new Date(now.getTime() + RECOVERY_TOKEN_TTL_MS)
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({ data: { identifier, token: hashRecoveryToken(token), expires } }),
  ])
  return { ok: true, url: `${base}/auth/reset-password#token=${token}`, expires }
}

function parseArgs(argv) {
  const args = { print: false }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--print') args.print = true
    else if (arg === '--email' || arg === '--origin') args[arg.slice(2)] = argv[++index]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.email || !args.origin) throw new Error('Usage: node scripts/issue-password-reset.mjs --email <address> --origin <https://app> [--print]')
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  normaliseOrigin(args.origin)
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString || !/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    throw new Error('DATABASE_URL must be exported in this shell (read it with hidden input).')
  }
  const [{ PrismaPg }, { PrismaClient }] = await Promise.all([import('@prisma/adapter-pg'), import('@prisma/client')])
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  try {
    const result = await issueRecoveryLink(prisma, args)
    if (!result.ok) {
      console.error(`No link issued: ${result.reason}`)
      process.exitCode = 2
      return
    }
    if (args.print) {
      console.log(result.url)
    } else {
      const copied = spawnSync('pbcopy', { input: result.url })
      if (copied.status !== 0) throw new Error('pbcopy unavailable; rerun with --print')
      console.log('Reset link copied to the clipboard.')
    }
    console.log(`Expires ${result.expires.toISOString()}. Send it only to the account's email address.`)
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Password reset issuance failed')
    process.exit(1)
  })
}
