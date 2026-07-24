import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const trackerPath = resolve('docs/templates/step11-private-pilot-tracker.csv')
const requiredHeaders = [
  'prospect_id',
  'name',
  'company',
  'role',
  'icp_fit_reason',
  'service_type_or_deliverable_type',
  'source',
  'contact_path',
  'invite_url',
  'first_contact_date',
  'reply_status',
  'demo_booked_date',
  'demo_completed_date',
  'onboarding_completed',
  'provider_configured',
  'persona_created',
  'comparison_ready_conversation_saved',
  'analytics_reviewed',
  'willing_to_use_on_client_work',
  'top_objection',
  'top_friction_point',
  'next_action',
  'outcome',
]

const csv = readFileSync(trackerPath, 'utf8').trimEnd()
const [headerLine, ...rows] = csv.split('\n')
const headers = headerLine.split(',')
const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header))

if (missingHeaders.length > 0) {
  throw new Error(`Missing required tracker headers: ${missingHeaders.join(', ')}`)
}

if (rows.length < 10) {
  throw new Error(`Expected at least 10 pilot rows, found ${rows.length}`)
}

const ids = rows.map((row) => row.split(',')[0].trim()).filter(Boolean)
const uniqueIds = new Set(ids)

if (ids.length !== rows.length) {
  throw new Error('Every pilot tracker row must include a prospect_id')
}

if (uniqueIds.size !== ids.length) {
  throw new Error('Pilot tracker prospect_id values must be unique')
}

const invalidRows = rows
  .map((row, index) => ({ index: index + 2, columnCount: row.split(',').length }))
  .filter(({ columnCount }) => columnCount !== headers.length)

if (invalidRows.length > 0) {
  const lines = invalidRows.map(({ index }) => index).join(', ')
  throw new Error(`Pilot tracker rows must have ${headers.length} columns. Invalid lines: ${lines}`)
}

console.log(`Private pilot tracker is valid with ${rows.length} rows.`)
