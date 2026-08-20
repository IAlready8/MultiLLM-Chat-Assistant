import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const PROVIDER_ENDPOINT_ERROR_CODE = 'PROVIDER_ENDPOINT_BLOCKED'

const DEFAULT_PROVIDER_BASE_URLS: Readonly<Record<string, string>> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  anthropic: 'https://api.anthropic.com',
  googleai: 'https://generativelanguage.googleapis.com/v1beta',
  grok: 'https://api.x.ai/v1',
  mistral: 'https://api.mistral.ai/v1',
  kimi: 'https://api.moonshot.ai/v1',
  deepseek: 'https://api.deepseek.com',
}

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export type ProviderEndpointLookupAddress = {
  address: string
  family: 4 | 6
}

export type ProviderEndpointLookup = (
  hostname: string,
) => Promise<ProviderEndpointLookupAddress[]>

export class ProviderEndpointError extends Error {
  readonly code = PROVIDER_ENDPOINT_ERROR_CODE

  constructor(message = 'The configured provider endpoint is not allowed.') {
    super(message)
    this.name = 'ProviderEndpointError'
  }
}

function rejectEndpoint(message?: string): never {
  throw new ProviderEndpointError(message)
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized || '/'
}

function parseUrl(value: unknown, allowQuery: boolean): URL {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return rejectEndpoint()
  }

  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    return rejectEndpoint()
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return rejectEndpoint()
  }
  if (!parsed.hostname || parsed.username || parsed.password || parsed.hash) {
    return rejectEndpoint()
  }
  if (!allowQuery && parsed.search) {
    return rejectEndpoint()
  }

  parsed.pathname = normalizePath(parsed.pathname)
  return parsed
}

function sameBaseUrl(left: URL, right: URL): boolean {
  return (
    left.protocol === right.protocol &&
    left.hostname === right.hostname &&
    left.port === right.port &&
    normalizePath(left.pathname) === normalizePath(right.pathname)
  )
}

function isLoopbackIp(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    return address.split('.')[0] === '127'
  }

  if (family !== 6) return false
  const parts = parseIpv6(address)
  return (
    parts !== null &&
    parts.slice(0, 7).every((part) => part === 0) &&
    parts[7] === 1
  )
}

type Ipv6Cidr = {
  prefixParts: number[]
  prefixLength: number
}

const BLOCKED_IPV6_CIDRS: readonly Ipv6Cidr[] = [
  {
    prefixParts: [0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000],
    prefixLength: 128,
  }, // unspecified
  {
    prefixParts: [0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0001],
    prefixLength: 128,
  }, // loopback
  { prefixParts: [0xfc00], prefixLength: 7 }, // unique local
  { prefixParts: [0xfe80], prefixLength: 10 }, // link-local
  { prefixParts: [0xff00], prefixLength: 8 }, // multicast
  { prefixParts: [0x2001, 0x0db8], prefixLength: 32 }, // documentation
  { prefixParts: [0x2001, 0x0000], prefixLength: 32 }, // Teredo
  { prefixParts: [0x2002], prefixLength: 16 }, // 6to4 transition
  { prefixParts: [0xfec0], prefixLength: 10 }, // deprecated site-local
  { prefixParts: [0x0064, 0xff9b, 0x0000, 0x0000, 0x0000, 0x0000], prefixLength: 96 }, // NAT64
  { prefixParts: [0x0064, 0xff9b, 0x0001], prefixLength: 48 }, // local-use translation
  { prefixParts: [0x0100, 0x0000, 0x0000, 0x0000], prefixLength: 64 }, // discard-only
  { prefixParts: [0x0100, 0x0000, 0x0000, 0x0001], prefixLength: 64 }, // dummy prefix
  { prefixParts: [0x2001, 0x0002, 0x0000], prefixLength: 48 }, // benchmarking
]

function isIpv6InCidr(
  addressParts: number[],
  prefixParts: number[],
  prefixLength: number,
): boolean {
  if (
    addressParts.length !== 8 ||
    prefixLength < 0 ||
    prefixLength > 128 ||
    prefixParts.length < Math.ceil(prefixLength / 16)
  ) {
    return false
  }

  const completeWords = Math.floor(prefixLength / 16)
  for (let index = 0; index < completeWords; index += 1) {
    if (addressParts[index] !== prefixParts[index]) return false
  }

  const remainingBits = prefixLength % 16
  if (remainingBits === 0) return true

  const mask = (0xffff << (16 - remainingBits)) & 0xffff
  return (
    (addressParts[completeWords] & mask) ===
    (prefixParts[completeWords] & mask)
  )
}

function isBlockedIpv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true
  }

  const [first, second] = octets
  return (
    first === 0 ||
    first === 10 ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && octets[2] === 100) ||
    (first === 192 && second === 88 && octets[2] === 99) ||
    (first === 203 && second === 0 && octets[2] === 113) ||
    first >= 224
  )
}

function parseIpv6(address: string): number[] | null {
  const normalized = address.toLowerCase()
  if (normalized.includes('%')) return null

  const sections = normalized.split('::')
  if (sections.length > 2) return null

  const parseSection = (section: string): number[] | null => {
    if (!section) return []

    const values: number[] = []
    const pieces = section.split(':')
    for (const [index, piece] of pieces.entries()) {
      if (piece.includes('.')) {
        if (index !== pieces.length - 1) return null
        const octets = piece.split('.').map(Number)
        if (
          octets.length !== 4 ||
          octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
        ) {
          return null
        }
        values.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3])
        continue
      }

      if (!/^[0-9a-f]{1,4}$/.test(piece)) return null
      values.push(Number.parseInt(piece, 16))
    }
    return values
  }

  const left = parseSection(sections[0])
  const right = sections.length === 2 ? parseSection(sections[1]) : []
  if (!left || !right) return null

  if (sections.length === 1) {
    return left.length === 8 ? left : null
  }

  const missing = 8 - left.length - right.length
  if (missing < 1) return null
  return [...left, ...Array.from({ length: missing }, () => 0), ...right]
}

export function isBlockedIp(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return isBlockedIpv4(address)
  if (family !== 6) return true

  const parts = parseIpv6(address)
  if (!parts) return true

  const isIpv4Mapped =
    parts.slice(0, 5).every((part) => part === 0) &&
    (parts[5] === 0 || parts[5] === 0xffff)
  if (isIpv4Mapped) {
    const octets = [
      parts[6] >> 8,
      parts[6] & 0xff,
      parts[7] >> 8,
      parts[7] & 0xff,
    ]
    if (isBlockedIpv4(octets.join('.'))) return true
  }

  return BLOCKED_IPV6_CIDRS.some(({ prefixParts, prefixLength }) =>
    isIpv6InCidr(parts, prefixParts, prefixLength),
  )
}

function normalizedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
}

function isBlockedHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata' ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data'
  )
}

function isApprovedLocalOllamaEndpoint(url: URL, provider: string): boolean {
  if (provider !== 'ollama' || isProduction() || url.protocol !== 'http:') {
    return false
  }

  const effectivePort = url.port || '80'
  if (effectivePort !== '11434') return false

  const hostname = normalizedHostname(url)
  return hostname === 'localhost' || isLoopbackIp(hostname)
}

function defaultLookup(hostname: string): Promise<ProviderEndpointLookupAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true }) as Promise<
    ProviderEndpointLookupAddress[]
  >
}

async function validateResolvedAddresses(
  url: URL,
  provider: string,
  lookup: ProviderEndpointLookup,
): Promise<void> {
  const hostname = normalizedHostname(url)
  if (isIP(hostname)) {
    if (!isApprovedLocalOllamaEndpoint(url, provider) && isBlockedIp(hostname)) {
      rejectEndpoint()
    }
    return
  }

  if (isApprovedLocalOllamaEndpoint(url, provider)) return
  if (isBlockedHostname(hostname)) rejectEndpoint()

  let addresses: ProviderEndpointLookupAddress[]
  try {
    addresses = await lookup(hostname)
  } catch {
    return rejectEndpoint()
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isBlockedIp(address))
  ) {
    rejectEndpoint()
  }
}

export function getProviderBaseUrl(
  provider: string,
  configuredBaseUrl: unknown,
): string {
  const hasConfiguredValue = configuredBaseUrl !== undefined

  if (provider === 'ollama') {
    if (isProduction()) {
      rejectEndpoint(
        'Ollama endpoints are not available in production-mode deployments.',
      )
    }

    const baseUrl = hasConfiguredValue
      ? parseUrl(configuredBaseUrl, false)
      : parseUrl(DEFAULT_OLLAMA_BASE_URL, false)
    if (!isApprovedLocalOllamaEndpoint(baseUrl, provider)) {
      rejectEndpoint('Only the local Ollama endpoint on port 11434 is allowed.')
    }
    return baseUrl.toString().replace(/\/$/, '')
  }

  const expectedBaseUrl = DEFAULT_PROVIDER_BASE_URLS[provider]
  if (!expectedBaseUrl) rejectEndpoint()

  const expected = parseUrl(expectedBaseUrl, false)
  if (!hasConfiguredValue) return expected.toString().replace(/\/$/, '')

  const configured = parseUrl(configuredBaseUrl, false)
  if (!sameBaseUrl(configured, expected)) rejectEndpoint()
  return expected.toString().replace(/\/$/, '')
}

type ProviderFetchOptions = {
  baseUrl?: unknown
  fetchImpl?: typeof fetch
  lookup?: ProviderEndpointLookup
}

function isRedirect(status: number): boolean {
  return REDIRECT_STATUSES.has(status)
}

async function validateProviderTarget(
  provider: string,
  target: URL,
  baseUrl: string,
  lookup: ProviderEndpointLookup,
): Promise<void> {
  const base = parseUrl(baseUrl, false)
  if (target.origin !== base.origin) rejectEndpoint()
  await validateResolvedAddresses(target, provider, lookup)
}

export async function providerFetch(
  provider: string,
  url: string | URL,
  init: RequestInit = {},
  options: ProviderFetchOptions = {},
): Promise<Response> {
  const baseUrl = getProviderBaseUrl(provider, options.baseUrl)
  const target = parseUrl(String(url), true)
  const lookup = options.lookup ?? defaultLookup

  if (!(process.env.NODE_ENV === 'test' && !options.lookup)) {
    await validateProviderTarget(provider, target, baseUrl, lookup)
  } else if (target.origin !== new URL(baseUrl).origin) {
    rejectEndpoint()
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(target.toString(), {
    ...init,
    redirect: 'error',
  })

  if (isRedirect(response.status)) {
    const location = response.headers?.get('location')
    if (location) {
      let redirectTarget: URL
      try {
        redirectTarget = new URL(location, target)
      } catch {
        return rejectEndpoint()
      }
      await validateProviderTarget(provider, redirectTarget, baseUrl, lookup)
    }
    rejectEndpoint('Provider redirects are not allowed.')
  }

  return response
}
