import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { testDeletionBrowser, testPublicBrowser } from './test-account-browser.mjs'

const database = new URL(process.env.DATABASE_URL || 'postgresql://invalid')
const base = new URL(process.env.GENERATION_TEST_BASE_URL || 'http://localhost:3001')
assert.equal(process.env.GENERATION_INTEGRATION_TEST, 'true')
assert.ok(['localhost', '127.0.0.1'].includes(database.hostname) && /test|smoke/.test(database.pathname), 'Only an explicitly selected local test database is allowed')
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname))
const db = new pg.Pool({ connectionString: database.toString() })
const suffix = randomUUID().replaceAll('-', '')
const userId = `deletion-test-${suffix}`
const browserUser = `deletion-browser-${suffix}`
const password = randomUUID()
const trigger = `deletion_fault_${suffix}`
const json = value => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
function client() {
  const cookies = new Map()
  return async (pathname, options = {}) => {
    const response = await fetch(new URL(pathname, base), { ...options, redirect: 'manual', signal: AbortSignal.timeout(30_000), headers: { ...options.headers, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') } })
    for (const cookie of response.headers.getSetCookie()) { const first = cookie.split(';')[0]; const at = first.indexOf('='); cookies.set(first.slice(0, at), first.slice(at + 1)) }
    return response
  }
}
async function login(id) {
  const request = client()
  const csrf = await (await request('/api/auth/csrf')).json()
  await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: `${id}@example.test`, password, json: 'true', callbackUrl: base.toString() }).toString() })
  assert.equal((await (await request('/api/auth/session')).json()).user?.id, id)
  return request
}
try {
  const hash = await bcrypt.hash(password, 10)
  for (const id of [userId, browserUser]) await db.query('INSERT INTO "User" (id, email, password) VALUES ($1, $2, $3)', [id, `${id}@example.test`, hash])
  const conversation = `conversation-${suffix}`
  const message = `message-${suffix}`
  await db.query('INSERT INTO "Conversation" (id,title,"updatedAt","userId") VALUES ($1,$2,NOW(),$3)', [conversation, 'Deletion proof', userId])
  await db.query('INSERT INTO "Message" (id,role,content,"conversationId") VALUES ($1,\'assistant\',\'owned text\',$2)', [message, conversation])
  await db.query('INSERT INTO "Generation" (id,"requestHash","updatedAt","userId","conversationId","messageId",status) VALUES ($1,\'test\',NOW(),$2,$3,$4,\'complete\')', [`generation-${suffix}`, userId, conversation, message])
  await db.query('INSERT INTO "LlmQuotaUsage" (id,"userId",units) VALUES ($1,$2,1)', [`quota-${suffix}`, userId])
  await db.query('INSERT INTO "ProviderConfig" (id,provider,"apiKey","updatedAt","userId") VALUES ($1,\'openai\',\'synthetic-encrypted-key-not-for-use\',NOW(),$2)', [`provider-${suffix}`, userId])
  await db.query('INSERT INTO "Persona" (id,title,prompt,"updatedAt","userId") VALUES ($1,\'Owned persona\',\'Owned prompt\',NOW(),$2)', [`persona-${suffix}`, userId])
  await db.query('INSERT INTO "Analytics" (id,event,"userId") VALUES ($1,\'test\',$2)', [`analytics-${suffix}`, userId])
  const request = await login(userId)
  const full = await request('/api/account/data', { method: 'POST' })
  assert.equal(full.status, 200)
  const archive = await full.json()
  assert.equal(archive.profile.email, `${userId}@example.test`)
  assert.equal(archive.personas[0].prompt, 'Owned prompt')
  assert.equal(archive.history.messages[0].content, 'owned text')
  assert.ok(!JSON.stringify(archive).includes('synthetic-encrypted-key'))
  assert.ok(!JSON.stringify(archive).includes(hash))
  assert.equal((await request('/api/account/deletion', json({ userId, confirmation: 'DELETE MY ACCOUNT', password: 'wrong' }))).status, 403)
  assert.equal((await request('/api/account/deletion', json({ userId: browserUser, confirmation: 'DELETE MY ACCOUNT', password }))).status, 409)
  // Inject one deterministic DB failure on this task-owned row only. A real
  // PostgreSQL transaction must roll back the cascade and keep recovery intent.
  await db.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id = '${userId}' THEN RAISE EXCEPTION 'synthetic isolated deletion failure'; END IF; RETURN OLD; END $$`)
  await db.query(`CREATE TRIGGER ${trigger} BEFORE DELETE ON "User" FOR EACH ROW EXECUTE FUNCTION ${trigger}()`)
  const first = await request('/api/account/deletion', json({ userId, confirmation: 'DELETE MY ACCOUNT', password }))
  assert.equal(first.status, 503)
  const intent = (await db.query('SELECT * FROM "AccountDeletion" WHERE "userId"=$1', [userId])).rows[0]
  assert.equal(intent.status, 'billing_stopped')
  assert.equal(intent.lastErrorCode, 'DELETION_RETRY_REQUIRED')
  assert.equal((await db.query('SELECT id FROM "Message" WHERE id=$1', [message])).rowCount, 1, 'Failed purge must not lose data')
  assert.ok((await db.query('SELECT "deletionRequestedAt" FROM "User" WHERE id=$1', [userId])).rows[0].deletionRequestedAt)
  for (const endpoint of ['/api/conversations', '/api/config', '/api/account/export', '/api/account/data']) {
    assert.equal((await request(endpoint, endpoint.includes('/account/') ? { method: 'POST' } : {})).status, 401, `${endpoint} must reject pending deletion`)
  }
  assert.equal((await request('/api/account/deletion')).status, 200, 'Recovery stays available')
  await db.query(`DROP TRIGGER ${trigger} ON "User"`)
  await db.query(`DROP FUNCTION ${trigger}()`)
  const retry = await request('/api/account/deletion', json({ userId, confirmation: 'DELETE MY ACCOUNT' }))
  assert.equal(retry.status, 200)
  assert.equal((await retry.json()).status, 'complete')
  for (const table of ['User', 'Conversation', 'ProviderConfig', 'Persona', 'Analytics', 'Generation', 'LlmQuotaUsage']) {
    const column = table === 'User' ? 'id' : 'userId'
    assert.equal((await db.query(`SELECT COUNT(*)::int AS count FROM "${table}" WHERE "${column}"=$1`, [userId])).rows[0].count, 0, `${table} must be removed`)
  }
  assert.equal((await db.query('SELECT id FROM "Message" WHERE id=$1', [message])).rowCount, 0)
  assert.equal((await request('/api/conversations')).status, 401)
  assert.equal((await request('/api/account/deletion', json({ userId, confirmation: 'DELETE MY ACCOUNT' }))).status, 401)
  assert.equal((await (await request('/api/auth/session')).json()).user, undefined, 'Old session must no longer disclose identity')
  await assert.rejects(db.query('INSERT INTO "Analytics" (id,event,"userId") VALUES ($1,\'late\',$2)', [`late-${suffix}`, userId]), error => error.code === '23503', 'Late analytics cannot recreate deleted data')
  assert.equal((await db.query('SELECT id FROM "User" WHERE id=$1', [browserUser])).rowCount, 1, 'Other account must survive')
  if (process.env.RUN_ACCOUNT_BROWSER_QA === 'true') {
    await testPublicBrowser({ baseUrl: base.toString() })
    await testDeletionBrowser({ baseUrl: base.toString(), email: `${browserUser}@example.test`, password })
    assert.equal((await db.query('SELECT id FROM "User" WHERE id=$1', [browserUser])).rowCount, 0)
  }
  console.log(JSON.stringify({ passed: ['account data export includes owned profile/personas/history and excludes secrets', 'password reauthentication', 'account-switch denial', 'durable deletion request', 'real PostgreSQL cascade rollback after injected failure', 'pending account blocks workspace and export', 'retry completes cascade', 'old session loses identity and API access', 'late analytics blocked', 'other account survives', ...(process.env.RUN_ACCOUNT_BROWSER_QA === 'true' ? ['public desktop/mobile browser QA', 'confirmed deletion browser QA'] : [])] }))
} finally {
  await db.query(`DROP TRIGGER IF EXISTS ${trigger} ON "User"`)
  await db.query(`DROP FUNCTION IF EXISTS ${trigger}()`)
  await db.query('DELETE FROM "User" WHERE id=ANY($1::text[])', [[userId, browserUser]])
  await db.query('DELETE FROM "AccountDeletion" WHERE "userId"=ANY($1::text[])', [[userId, browserUser]])
  await db.end()
}
