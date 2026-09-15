#!/usr/bin/env node
/**
 * Generator: config/capability-matrix.yaml -> generated provider artifacts.
 *
 * Source of truth rule:
 *   ONLY edit config/capability-matrix.yaml
 *   Run npm run generate:providers to update generated layers.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const MATRIX_PATH = path.join(ROOT, 'config', 'capability-matrix.yaml')
const OUT_DIR = path.join(ROOT, 'src', 'generated')

function parseScalar(value) {
  const trimmed = value.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)

  const inlineMap = trimmed.match(/^\{\s*prompt:\s*([^,]+),\s*completion:\s*([^}]+)\}$/)
  if (inlineMap) {
    return {
      prompt: Number(inlineMap[1].trim()),
      completion: Number(inlineMap[2].trim()),
    }
  }

  return trimmed.replace(/^['"]|['"]$/g, '')
}

function parseProviderMatrix(content) {
  const providers = []
  let inProviders = false
  let current

  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === 'providers:') {
      inProviders = true
      continue
    }

    if (inProviders && /^[a-zA-Z_][\w-]*:\s*$/.test(line) && !line.startsWith(' ')) {
      break
    }

    if (!inProviders) continue

    const itemMatch = line.match(/^\s{2}-\s+id:\s+(.+)$/)
    if (itemMatch) {
      current = { id: parseScalar(itemMatch[1]) }
      providers.push(current)
      continue
    }

    const keyMatch = line.match(/^\s{4}([a-zA-Z_][\w-]*):\s+(.+)$/)
    if (keyMatch && current) {
      current[keyMatch[1]] = parseScalar(keyMatch[2])
    }
  }

  return providers.map((provider) => validateProvider(provider))
}

function validateProvider(provider) {
  const requiredStringFields = [
    'id',
    'name',
    'placeholder',
    'description',
    'type',
    'default_model',
  ]

  for (const field of requiredStringFields) {
    if (typeof provider[field] !== 'string' || provider[field].trim() === '') {
      throw new Error(`Invalid provider matrix entry: missing ${field}`)
    }
  }

  for (const field of ['streaming', 'supports_tools', 'requires_api_key']) {
    if (typeof provider[field] !== 'boolean') {
      throw new Error(`Invalid provider ${provider.id}: missing boolean ${field}`)
    }
  }

  const cost = provider.cost_per_1k
  if (
    !cost ||
    typeof cost !== 'object' ||
    typeof cost.prompt !== 'number' ||
    typeof cost.completion !== 'number'
  ) {
    throw new Error(`Invalid provider ${provider.id}: missing cost_per_1k`)
  }

  return provider
}

function ensureUniqueProviderIds(providers) {
  const seen = new Set()
  for (const provider of providers) {
    if (seen.has(provider.id)) {
      throw new Error(`Duplicate provider id in matrix: ${provider.id}`)
    }
    seen.add(provider.id)
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8')
  console.log(`Generated: ${path.relative(ROOT, filePath)}`)
}

function generate() {
  const matrix = fs.readFileSync(MATRIX_PATH, 'utf8')
  const providers = parseProviderMatrix(matrix)
  ensureUniqueProviderIds(providers)
  ensureDir(OUT_DIR)

  const ids = providers.map((provider) => provider.id)
  const providerRegistry = providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    placeholder: provider.placeholder,
    description: provider.description,
    requiresApiKey: provider.requires_api_key,
    acceptsApiKey: provider.accepts_api_key ?? true,
    operational: provider.operational ?? true,
    disabledReason: provider.disabled_reason,
  }))
  const costTable = Object.fromEntries(
    providers.map((provider) => [provider.id, provider.cost_per_1k]),
  )
  const capabilities = Object.fromEntries(
    providers.map((provider) => [
      provider.id,
      {
        streaming: provider.streaming,
        supportsTools: provider.supports_tools,
        requiresApiKey: provider.requires_api_key,
        defaultModel: provider.default_model,
      },
    ]),
  )

  writeFile(
    path.join(OUT_DIR, 'provider-meta.ts'),
    `// AUTO-GENERATED from config/capability-matrix.yaml - DO NOT EDIT
export interface ProviderMeta {
  id: ProviderId;
  name: string;
  placeholder: string;
  description: string;
  requiresApiKey: boolean;
  acceptsApiKey?: boolean;
  operational?: boolean;
  disabledReason?: string;
}

export const allProviderIds = ${JSON.stringify(ids, null, 2)} as const;

export type ProviderId = typeof allProviderIds[number];

export const providerRegistry: readonly ProviderMeta[] = ${JSON.stringify(providerRegistry, null, 2)};

export const operationalProviderRegistry = providerRegistry.filter(provider => provider.operational !== false);
export const supportedProviderIds = operationalProviderRegistry.map(provider => provider.id);

export const getProviderMeta = (id: string) =>
  providerRegistry.find(provider => provider.id === id);

export const isProviderApiKeyRequired = (id: string) =>
  getProviderMeta(id)?.requiresApiKey ?? true;
`,
  )

  writeFile(
    path.join(OUT_DIR, 'costs.ts'),
    `// AUTO-GENERATED from config/capability-matrix.yaml - DO NOT EDIT
export const costTable = ${JSON.stringify(costTable, null, 2)} as const;

export type CostTable = typeof costTable;

export function getCostRate(provider: string): { prompt: number; completion: number } {
  return (costTable as Record<string, { prompt: number; completion: number }>)[provider] ?? { prompt: 0.01, completion: 0.01 };
}

export function estimateCost(provider: string, totalTokens: number): number {
  const rate = getCostRate(provider);
  const avg = (rate.prompt + rate.completion) / 2;
  return (totalTokens / 1000) * avg;
}
`,
  )

  writeFile(
    path.join(OUT_DIR, 'capabilities.ts'),
    `// AUTO-GENERATED from config/capability-matrix.yaml - DO NOT EDIT
export const providerCapabilities = ${JSON.stringify(capabilities, null, 2)} as const;

export type ProviderCapabilities = typeof providerCapabilities;

export function getCapabilities(provider: string) {
  return (providerCapabilities as Record<string, {
    streaming: boolean;
    supportsTools: boolean;
    requiresApiKey: boolean;
    defaultModel: string;
  }>)[provider] ?? {
    streaming: false,
    supportsTools: false,
    requiresApiKey: true,
    defaultModel: '',
  };
}
`,
  )

  console.log('Generation complete. Source: config/capability-matrix.yaml')
}

generate()
