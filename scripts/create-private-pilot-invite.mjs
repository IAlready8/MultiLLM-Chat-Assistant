const DEFAULT_BASE_URL = 'https://multi-llm-chat-assistant.vercel.app/'
const SOURCE = 'founder-outbound'
const MAX_VALUE_LENGTH = 64

const usage = `Usage: npm run pilot:invite -- --cohort <cohort> [--campaign <campaign>] [--base-url <url>]`

const readOption = (args, option) => {
  const index = args.indexOf(option)
  return index === -1 ? undefined : args[index + 1]
}

const sanitizeValue = (value) => {
  if (!value) {
    return undefined
  }

  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_VALUE_LENGTH)

  return sanitized || undefined
}

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(usage)
  process.exit(0)
}

const cohort = sanitizeValue(readOption(args, '--cohort'))
const campaign = sanitizeValue(readOption(args, '--campaign') ?? 'private-pilot')
const baseUrl = readOption(args, '--base-url') ?? DEFAULT_BASE_URL

if (!cohort || !campaign) {
  console.error('A non-empty --cohort and --campaign value are required.')
  console.error(usage)
  process.exit(1)
}

let inviteUrl
try {
  inviteUrl = new URL(baseUrl)
} catch {
  console.error(`Invalid --base-url value: ${baseUrl}`)
  process.exit(1)
}

if (!['http:', 'https:'].includes(inviteUrl.protocol)) {
  console.error('The --base-url protocol must be http or https.')
  process.exit(1)
}

inviteUrl.searchParams.set('source', SOURCE)
inviteUrl.searchParams.set('campaign', campaign)
inviteUrl.searchParams.set('cohort', cohort)

console.log(inviteUrl.toString())
