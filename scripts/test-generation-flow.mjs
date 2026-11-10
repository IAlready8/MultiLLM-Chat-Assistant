import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { testAccountBrowser, testHistoryBrowser } from './test-account-browser.mjs'

// This runner needs a migrated disposable database and a development server.
// The application stays real; only the external model API is controlled here.
const database = new URL(process.env.DATABASE_URL || 'postgresql://invalid')
const base = new URL(process.env.GENERATION_TEST_BASE_URL || 'http://localhost:3000')
assert.equal(process.env.GENERATION_INTEGRATION_TEST, 'true', 'Explicit isolated-test opt-in is required')
assert.ok(['localhost', '127.0.0.1'].includes(database.hostname) && /test|smoke/.test(database.pathname), 'Only a local test database is allowed')
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname), 'Only a local application is allowed')
const db = new pg.Pool({ connectionString: database.toString() })
const runId = randomUUID()
const owner = `generation-test-owner-${runId}`
const outsider = `generation-test-outsider-${runId}`
const historianId = `generation-test-historian-${runId}`
const password = randomUUID()
let providerCalls = 0
const providerPrompts = []
const modelApi = createServer(async (req, res) => {
  if (req.url === '/api/tags') { res.setHeader('Content-Type', 'application/json'); res.end('{"models":[]}'); return }
  assert.equal(req.url, '/api/chat')
  let body = ''
  for await (const chunk of req) body += chunk
  const input = JSON.parse(body)
  providerCalls++
  providerPrompts.push(input.messages ?? [])
  if (input.model === 'qa-fail') { res.writeHead(429); res.end('{"error":"private provider error detail"}'); return }
  if (input.stream === false) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ message: { content: `answer:${input.model}` }, done: true, prompt_eval_count: 12, eval_count: 4 })); return }
  res.setHeader('Content-Type', 'application/x-ndjson')
  const emit = value => res.write(JSON.stringify(value) + '\n')
  emit({ message: { content: `answer:${input.model}` }, done: false })
  if (input.model === 'qa-truncated') { res.end(); return }
  if (input.model === 'qa-cancel') {
    const timer = setTimeout(() => { emit({ done: true }); res.end() }, 10_000)
    res.on('close', () => clearTimeout(timer))
    return
  }
  if (input.model === 'qa-slow') await new Promise(resolve => setTimeout(resolve, 150))
  emit({ done: true, prompt_eval_count: 12, eval_count: 4 })
  res.end()
})

function client() {
  const cookies = new Map()
  return async (path, options = {}) => {
    const response = await fetch(new URL(path, base), { ...options, redirect: 'manual', headers: { ...options.headers, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') }, signal: options.signal ?? AbortSignal.timeout(30_000) })
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(';')[0]
      const separator = first.indexOf('=')
      cookies.set(first.slice(0, separator), first.slice(separator + 1))
    }
    return response
  }
}
const json = data => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
async function login(id) {
  const request = client()
  const csrf = await (await request('/api/auth/csrf')).json()
  const response = await request('/api/auth/callback/credentials?json=true', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: `${id}@example.test`, password, json: 'true', callbackUrl: base.toString() }).toString() })
  assert.ok([200, 302].includes(response.status), `Login failed: ${response.status}`)
  const session = await (await request('/api/auth/session')).json()
  assert.equal(session.user?.id, id, 'Credential login must produce a real application session')
  return request
}
async function events(response) {
  const text = await response.text()
  assert.equal(response.status, 200, `Stream rejected: ${response.status} ${text}`)
  return text.trim().split('\n').map(line => JSON.parse(line))
}

try {
  const hash = await bcrypt.hash(password, 10)
  for (const id of [owner, outsider, historianId]) await db.query('INSERT INTO "User" (id, email, name, password) VALUES ($1, $2, $1, $3)', [id, `${id}@example.test`, hash])
  await db.query('INSERT INTO "ProviderConfig" (id, provider, "userId", settings, "updatedAt") VALUES ($1, $2, $3, $4, NOW())', [`config-${runId}`, 'ollama', owner, JSON.stringify({ baseUrl: 'http://localhost:11434', models: ['qa-fast'] })])
  await db.query('INSERT INTO "ProviderConfig" (id, provider, "userId", settings, "updatedAt") VALUES ($1, $2, $3, $4, NOW())', [`historian-config-${runId}`, 'ollama', historianId, JSON.stringify({ baseUrl: 'http://localhost:11434', models: ['qa-fast'] })])
  modelApi.listen(11434)
  await once(modelApi, 'listening')
  const request = await login(owner)
  const other = await login(outsider)
  const profileUpdate = await request('/api/account/profile', { ...json({ name: 'Persisted account name' }), method: 'PATCH' })
  assert.equal(profileUpdate.status, 200)
  assert.equal((await (await request('/api/account/profile')).json()).name, 'Persisted account name')
  assert.equal((await other('/api/account/profile', { ...json({ name: 'Denied', id: owner }), method: 'PATCH' })).status, 400)
  if (process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT === 'true') {
    const health = await (await request('/api/health')).json()
    assert.equal(health.checks.rateLimit.status, 'connected')
    assert.equal(health.checks.rateLimit.scope, 'distributed')
  }
  assert.equal((await client()('/api/conversations')).status, 401)
  assert.equal((await request('/api/conversations', { ...json({ title: 'Denied origin' }), headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' } })).status, 403)
  const turnId = randomUUID()
  const create = await request('/api/conversations', json({ title: 'Generation integration test', messages: [{ role: 'user', content: 'Compare this prompt. '.repeat(30), clientId: turnId }] }))
  assert.equal(create.status, 201)
  const conversation = await create.json()
  const payload = (model, position, requestId = randomUUID()) => ({ provider: 'ollama', model, conversationId: conversation.id, requestId, turnId, instanceId: `instance-${position}`, position, messages: [{ role: 'user', content: 'Compare this prompt. '.repeat(30) }] })
  const slow = payload('qa-slow', 0)
  const fast = payload('qa-fast', 1)
  const failed = payload('qa-fail', 2)
  const streams = await Promise.all([slow, fast, failed].map(input => request('/api/llm/stream', json(input)).then(events)))
  assert.equal(streams[0].at(-1).type, 'done')
  assert.deepEqual(streams[1].at(-1).usage, { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16, usage_source: 'provider' })
  assert.equal(streams[2].at(-1).type, 'error')
  assert.ok(!JSON.stringify(streams[2]).includes('private provider error detail'))
  const loaded = await (await request(`/api/conversations/${conversation.id}`)).json()
  assert.deepEqual(loaded.messages.map(message => message.role), ['user', 'assistant', 'assistant', 'assistant'])
  assert.deepEqual(loaded.messages.slice(1).map(message => [message.model, message.generationStatus]), [['qa-slow', 'complete'], ['qa-fast', 'complete'], ['qa-fail', 'failed']])
  const beforeReplay = providerCalls
  assert.equal((await events(await request('/api/llm/stream', json(fast)))).at(-1).replay, true)
  assert.equal(providerCalls, beforeReplay, 'Replay must not dispatch a billable provider call')
  assert.equal((await request('/api/llm/stream', json({ ...fast, model: 'qa-other' }))).status, 409)
  assert.equal((await other(`/api/conversations/${conversation.id}`)).status, 404)
  assert.equal((await other(`/api/conversations/${conversation.id}`, { ...json({ title: 'Denied' }), method: 'PUT' })).status, 404)
  assert.equal((await other(`/api/conversations/${conversation.id}`, { method: 'DELETE' })).status, 404)
  // The other user needs their own provider config to reach the ownership check.
  await db.query('INSERT INTO "ProviderConfig" (id, provider, "userId", settings, "updatedAt") VALUES ($1, $2, $3, $4, NOW())', [`other-config-${runId}`, 'ollama', outsider, JSON.stringify({ baseUrl: 'http://localhost:11434' })])
  assert.equal((await other('/api/llm/stream', json(payload('qa-fast', 0)))).status, 404)
  assert.equal(providerCalls, beforeReplay)
  const duplicateTurn = { messages: [{ role: 'user', content: 'Next turn', clientId: randomUUID() }] }
  for (let i = 0; i < 2; i++) assert.equal((await request(`/api/conversations/${conversation.id}`, json(duplicateTurn.messages))).status, 200)
  const duplicateCount = await db.query('SELECT COUNT(*)::int AS count FROM "Message" WHERE "conversationId" = $1 AND "clientId" = $2', [conversation.id, duplicateTurn.messages[0].clientId])
  assert.equal(duplicateCount.rows[0].count, 1)
  const regeneration = await events(await request('/api/llm/stream', json(payload('qa-fast', 0))))
  assert.equal(regeneration.at(-1).type, 'done')
  const truncated = await events(await request('/api/llm/stream', json(payload('qa-truncated', 3))))
  assert.equal(truncated.at(-1).code, 'PROVIDER_STREAM_INTERRUPTED')
  const cancel = new AbortController()
  const canceled = await request('/api/llm/stream', { ...json(payload('qa-cancel', 4)), signal: cancel.signal })
  assert.equal(canceled.status, 200)
  const reader = canceled.body.getReader()
  assert.ok((await reader.read()).value.byteLength > 0)
  cancel.abort()
  await reader.cancel().catch(() => {})
  let canceledRow
  for (let attempt = 0; attempt < 40; attempt++) {
    canceledRow = (await db.query('SELECT content, "generationStatus" FROM "Message" WHERE "conversationId" = $1 AND model = $2', [conversation.id, 'qa-cancel'])).rows[0]
    if (canceledRow?.generationStatus === 'canceled') break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.equal(canceledRow?.generationStatus, 'canceled')
  assert.equal(canceledRow?.content, 'answer:qa-cancel')
  const ledger = await db.query('SELECT status, "usageSource", "promptTokens", "completionTokens" FROM "Generation" WHERE "conversationId" = $1', [conversation.id])
  assert.equal(ledger.rows.length, 6, 'Replay and conflicting request IDs must not create additional usage rows')
  assert.ok(ledger.rows.filter(row => row.status === 'complete').every(row => row.usageSource === 'provider' && row.promptTokens === 12 && row.completionTokens === 4))
  // Simulate a process dying after its last durable checkpoint.
  await db.query(`UPDATE "Generation" SET status = $1, "leaseExpiresAt" = NOW() - INTERVAL '1 minute' WHERE "conversationId" = $2 AND "messageId" IN (SELECT id FROM "Message" WHERE model = $3)`, ['running', conversation.id, 'qa-cancel'])
  await db.query('UPDATE "Message" SET "generationStatus" = $1 WHERE "conversationId" = $2 AND model = $3', ['running', conversation.id, 'qa-cancel'])
  const recovered = await (await request(`/api/conversations/${conversation.id}`)).json()
  assert.equal(recovered.messages.find(message => message.model === 'qa-cancel').generationStatus, 'interrupted')
  assert.equal(recovered.messages.find(message => message.model === 'qa-cancel').content, 'answer:qa-cancel')
  if (process.env.LLM_MONTHLY_REQUEST_LIMITS) {
    const ownerUsage = await db.query('SELECT SUM(units)::int AS used FROM "LlmQuotaUsage" WHERE "userId" = $1', [owner])
    assert.equal(ownerUsage.rows[0].used, 6, 'Replay, rejected ownership and duplicate requests must not consume quota')
    const attempts = await Promise.all(Array.from({ length: 9 }, () => other('/api/llm/stream', json({ provider: 'ollama', model: 'qa-fast', messages: [{ role: 'user', content: 'quota test' }] }))))
    assert.equal(attempts.filter(response => response.status === 200).length, 8, 'Atomic quota admission must never exceed the configured allowance')
    assert.equal(attempts.filter(response => response.status === 429).length, 1)
    await Promise.all(attempts.map(response => response.text()))
  }
  const savedBatch = { conversationId: conversation.id, turnId: duplicateTurn.messages[0].clientId, prompt: 'Next turn', requests: ['qa-fast', 'qa-slow'].map(model => ({ provider: 'ollama', model, prompt: 'Next turn', requestId: randomUUID() })) }
  const pipelineResults = await (await request('/api/llm/orchestrate', json(savedBatch))).json()
  assert.equal(pipelineResults.length, 2)
  assert.ok(pipelineResults.every(item => item.status === 'complete'))
  const callsBeforeBatchReplay = providerCalls
  const batchReplay = await (await request('/api/llm/orchestrate', json(savedBatch))).json()
  assert.ok(batchReplay.every(item => item.replay === true))
  assert.equal(providerCalls, callsBeforeBatchReplay)
  // Server-assembled history: the browser sends identities only, and the model
  // still receives persisted context from turns it never loaded. A separate
  // account keeps the owner's quota and history assertions unchanged.
  const historian = await login(historianId)
  const longConversation = await (await historian('/api/conversations', json({ title: 'Server history pagination', messages: [{ role: 'user', content: 'History turn 1', clientId: randomUUID() }] }))).json()
  assert.ok(longConversation.id)
  const longTurns = []
  for (let index = 2; index <= 6; index++) {
    const clientId = randomUUID()
    longTurns.push(clientId)
    assert.equal((await historian(`/api/conversations/${longConversation.id}`, json([{ role: 'user', content: `History turn ${index}`, clientId }]))).status, 200)
    assert.equal((await events(await historian('/api/llm/stream', json({ provider: 'ollama', model: 'qa-fast', history: 'server', conversationId: longConversation.id, requestId: randomUUID(), turnId: clientId, instanceId: 'history-instance', position: 0 })))).at(-1).type, 'done')
  }
  const serverHistoryPrompt = providerPrompts.at(-1)
  assert.equal(serverHistoryPrompt[0].content, 'History turn 1', 'Server history must start at the oldest persisted turn')
  assert.equal(serverHistoryPrompt.at(-1).content, 'History turn 6')
  assert.equal(serverHistoryPrompt.filter(message => message.role === 'user').length, 6)
  assert.equal(serverHistoryPrompt.filter(message => message.role === 'assistant' && message.content === 'answer:qa-fast').length, 4)
  assert.equal((await historian('/api/llm/stream', json({ provider: 'ollama', model: 'qa-fast', history: 'server', conversationId: longConversation.id, requestId: randomUUID(), turnId: longTurns.at(-1), messages: [{ role: 'user', content: 'stale browser history' }] }))).status, 400)
  const callsBeforeDeniedHistory = providerCalls
  assert.equal((await request('/api/llm/stream', json({ provider: 'ollama', model: 'qa-fast', history: 'server', conversationId: longConversation.id, requestId: randomUUID(), turnId: longTurns.at(-1), position: 0 }))).status, 404)
  assert.equal(providerCalls, callsBeforeDeniedHistory, 'Denied server history must not dispatch a provider call')
  assert.equal((await request(`/api/conversations/${longConversation.id}?messagesLimit=5`)).status, 404)
  assert.equal((await historian(`/api/conversations/${longConversation.id}?messagesLimit=0`)).status, 400)
  assert.equal((await historian(`/api/conversations/${longConversation.id}?messagesLimit=5&before=not-a-cursor`)).status, 400)
  const pagedTurnIds = []
  let messageCursor
  let messagePages = 0
  do {
    const messagePage = await (await historian(`/api/conversations/${longConversation.id}?messagesLimit=2${messageCursor ? `&before=${encodeURIComponent(messageCursor)}` : ''}`)).json()
    const userMessages = messagePage.messages.filter(message => message.role === 'user')
    assert.ok(userMessages.length <= 2)
    for (const message of userMessages) pagedTurnIds.push(message.clientId)
    for (const answer of messagePage.messages.filter(message => message.role === 'assistant')) {
      assert.ok(userMessages.some(message => message.clientId === answer.turnId), 'A page must not split a turn from its responses')
    }
    messageCursor = messagePage.nextMessageCursor
    assert.ok(++messagePages <= 4, 'Message cursor must make progress')
  } while (messageCursor)
  assert.equal(pagedTurnIds.length, 6, 'Message pagination must not duplicate or skip turns')
  assert.equal(new Set(pagedTurnIds).size, 6)
  if (process.env.RUN_ACCOUNT_BROWSER_QA === 'true') {
    // Exceed multi-chat's 20-turn first page without consuming provider quota.
    for (let index = 7; index <= 26; index++) {
      assert.equal((await historian(`/api/conversations/${longConversation.id}`, json([{ role: 'user', content: `History turn ${index}`, clientId: randomUUID() }]))).status, 200)
    }
    await testHistoryBrowser({ baseUrl: base.toString(), email: `${historianId}@example.test`, password })
  }
  const page = await (await request('/api/conversations?limit=1')).json()
  assert.equal(page.items.length, 1)
  assert.equal(page.items[0].userId, owner)
  for (const title of ['Pipeline: Page test', 'Roundtable: Page test']) {
    assert.equal((await request('/api/conversations', json({ title, messages: [{ role: 'user', content: 'Pagination fixture', clientId: randomUUID() }] }))).status, 201)
  }
  let cursor
  const historyIds = []
  do {
    const history = await (await request(`/api/conversations?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)).json()
    assert.ok(history.items.every(item => item.userId === owner))
    historyIds.push(...history.items.map(item => item.id))
    cursor = history.nextCursor
    assert.ok(historyIds.length <= 3, 'History cursor must make progress')
  } while (cursor)
  assert.equal(new Set(historyIds).size, 3, 'Pagination must not duplicate or skip records')
  const pipelineHistory = await (await request('/api/conversations?workspace=pipeline')).json()
  assert.equal(pipelineHistory.items.length, 1)
  assert.equal(pipelineHistory.items[0].title, 'Pipeline: Page test')
  const archiveResponse = await request('/api/account/export', { method: 'POST' })
  assert.equal(archiveResponse.status, 200)
  const archive = await archiveResponse.json()
  assert.equal(archive.format, 'multillm-conversation-archive')
  assert.equal(archive.conversations.length, 3)
  assert.ok(archive.messages.every(message => historyIds.includes(message.conversationId)))
  assert.ok(!JSON.stringify(archive).includes('ProviderConfig'))
  const otherArchive = await (await other('/api/account/export', { method: 'POST' })).json()
  assert.equal(otherArchive.conversations.length, 0)
  assert.equal(otherArchive.messages.length, 0)
  const exportRace = await Promise.all(Array.from({ length: 4 }, () => other('/api/account/export', { method: 'POST' })))
  assert.equal(exportRace.filter(response => response.status === 200).length, 2, 'Shared sliding-window limiter must admit only the two remaining exports')
  assert.equal(exportRace.filter(response => response.status === 429).length, 2)
  if (process.env.RUN_ACCOUNT_BROWSER_QA === 'true') await testAccountBrowser({ baseUrl: base.toString(), email: `${owner}@example.test`, password })
  const quotaBeforeRestore = await db.query('SELECT * FROM "LlmQuotaUsage" WHERE "userId" = $1 ORDER BY id', [outsider])
  const restoreRequest = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(archive) }
  const restores = await Promise.all([other('/api/account/restore', restoreRequest), other('/api/account/restore', restoreRequest)])
  assert.ok(restores.every(response => response.status === 200))
  const restoreResults = await Promise.all(restores.map(response => response.json()))
  assert.deepEqual(restoreResults.map(result => result.createdConversations).sort(), [0, 3])
  assert.deepEqual(restoreResults.map(result => result.skippedConversations).sort(), [0, 3])
  const restoredRows = await db.query('SELECT id FROM "Conversation" WHERE "userId" = $1', [outsider])
  assert.equal(restoredRows.rows.length, 3)
  for (const source of archive.conversations) {
    const copy = await db.query('SELECT id FROM \"Conversation\" WHERE \"userId\" = $1 AND title = $2', [outsider, source.title])
    const restoredMessages = await db.query('SELECT role, content FROM \"Message\" WHERE \"conversationId\" = $1 ORDER BY \"createdAt\", id', [copy.rows[0].id])
    assert.deepEqual(restoredMessages.rows, archive.messages.filter(message => message.conversationId === source.id).map(({ role, content }) => ({ role, content })))
  }
  assert.ok(restoredRows.rows.every(row => !historyIds.includes(row.id)))
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM "Generation" WHERE "userId" = $1', [outsider])).rows[0].count, 0)
  const quotaAfterRestore = await db.query('SELECT * FROM "LlmQuotaUsage" WHERE "userId" = $1 ORDER BY id', [outsider])
  assert.deepEqual(quotaAfterRestore.rows, quotaBeforeRestore.rows, 'Restore must neither add usage nor change existing accounting')
  await db.query('DELETE FROM "User" WHERE id = $1', [outsider])
  assert.equal((await other('/api/conversations')).status, 401, 'A deleted account must not retain access through its session token')
  // Plan usage and the account data export, against real rows.
  const usageResponse = await historian('/api/account/usage')
  assert.equal(usageResponse.status, 200)
  const usage = await usageResponse.json()
  assert.equal(usage.tier, 'FREE')
  assert.equal(usage.quota.limit, 8, 'Usage must report the enforced FREE allowance')
  assert.equal(usage.quota.remaining, Math.max(0, 8 - usage.quota.used))
  assert.equal(usage.paymentNeedsAttention, false)
  assert.equal((await fetch(new URL('/api/account/usage', base), { redirect: 'manual' })).status, 401, 'Usage must require a session')
  const dataResponse = await historian('/api/account/data')
  assert.equal(dataResponse.status, 200)
  assert.match(dataResponse.headers.get('content-disposition') ?? '', /^attachment; filename="account-data-/)
  const dataText = await dataResponse.text()
  const accountData = JSON.parse(dataText)
  assert.equal(accountData.profile.id, historianId)
  assert.equal(accountData.profile.email, `${historianId}@example.test`)
  assert.ok(accountData.connectedProviders.length > 0 && accountData.connectedProviders.every(item => typeof item.hasSavedApiKey === 'boolean'))
  assert.ok(accountData.conversations.count > 0)
  const storedSecrets = (await db.query('SELECT "apiKey", "settings" FROM "ProviderConfig" WHERE "userId" = $1', [historianId])).rows
  const storedHash = (await db.query('SELECT password FROM "User" WHERE id = $1', [historianId])).rows[0].password
  for (const secret of [storedHash, ...storedSecrets.flatMap(row => [row.apiKey, row.settings])].filter(value => typeof value === 'string' && value.length >= 12)) {
    assert.ok(!dataText.includes(secret), 'Account data export must not contain stored secrets')
  }
  assert.ok(!dataText.includes(owner), 'Account data export must not contain another account')
  for (const path of ['/pricing', '/support', '/terms', '/privacy', '/sitemap.xml', '/robots.txt']) {
    assert.equal((await fetch(new URL(path, base), { redirect: 'manual' })).status, 200, `${path} must be readable signed out`)
  }
  // Self-serve account deletion against the real database: every refusal path
  // leaves the account intact, and one confirmed request removes all of it.
  const deleteAccount = (client, body, headers = {}) => client('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const historianEmail = `${historianId}@example.test`
  const ownedCounts = async id => (await db.query('SELECT (SELECT COUNT(*) FROM "User" WHERE id = $1)::int AS users, (SELECT COUNT(*) FROM "Conversation" WHERE "userId" = $1)::int AS conversations, (SELECT COUNT(*) FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId" WHERE c."userId" = $1)::int AS messages, (SELECT COUNT(*) FROM "Generation" WHERE "userId" = $1)::int AS generations, (SELECT COUNT(*) FROM "ProviderConfig" WHERE "userId" = $1)::int AS configs, (SELECT COUNT(*) FROM "LlmQuotaUsage" WHERE "userId" = $1)::int AS quota, (SELECT COUNT(*) FROM "Analytics" WHERE "userId" = $1)::int AS analytics', [id])).rows[0]
  await db.query('INSERT INTO "Analytics" (id, event, "userId") VALUES ($1, $2, $3)', [`deletion-analytics-${runId}`, 'analytics_viewed', historianId])
  const historianBefore = await ownedCounts(historianId)
  const ownerBefore = await ownedCounts(owner)
  assert.ok(historianBefore.conversations > 0 && historianBefore.messages > 0 && historianBefore.generations > 0 && historianBefore.configs > 0 && historianBefore.analytics > 0, 'Deletion must be exercised against an account that owns data')
  assert.equal((await deleteAccount(historian, {})).status, 400)
  assert.equal((await deleteAccount(historian, { confirmEmail: `${owner}@example.test` })).status, 400, 'Another account email must not confirm deletion')
  assert.equal((await deleteAccount(historian, { confirmEmail: historianEmail, userId: owner })).status, 400, 'A caller must not be able to name a different account')
  const passwordRequired = await deleteAccount(historian, { confirmEmail: historianEmail })
  assert.equal(passwordRequired.status, 400)
  assert.equal((await passwordRequired.json()).code, 'PASSWORD_REQUIRED')
  assert.equal((await deleteAccount(historian, { confirmEmail: historianEmail, password: 'wrong-password' })).status, 401)
  assert.equal((await deleteAccount(historian, { confirmEmail: historianEmail, password }, { Origin: 'https://attacker.example' })).status, 403, 'Cross-origin deletion must be refused')
  assert.deepEqual(await ownedCounts(historianId), historianBefore, 'Refused deletion attempts must not remove anything')
  // Five attempts were consumed above; the sixth in the window is throttled
  // even though it carries valid credentials.
  assert.equal((await deleteAccount(historian, { confirmEmail: historianEmail, password })).status, 429, 'Deletion attempts must be rate limited per account')
  assert.deepEqual(await ownedCounts(historianId), historianBefore)
  // Clear only this account's deletion bucket in whichever shared backend is
  // active, so the confirmed request below is evaluated on its own merits.
  const deletionBucket = `account-delete:${historianId}`
  if (process.env.RATE_LIMIT_BACKEND === 'postgres') {
    await db.query('DELETE FROM "RateLimitBucket" WHERE id = $1', [createHash('sha256').update(deletionBucket).digest('hex')])
  } else if (process.env.REDIS_URL) {
    const { createClient } = await import('redis')
    const redis = createClient({ url: process.env.REDIS_URL })
    await redis.connect()
    await redis.del(deletionBucket)
    await redis.quit()
  }
  const deleted = await deleteAccount(historian, { confirmEmail: historianEmail.toUpperCase(), password })
  assert.equal(deleted.status, 200, `Confirmed deletion failed: ${deleted.status}`)
  assert.deepEqual(await ownedCounts(historianId), { users: 0, conversations: 0, messages: 0, generations: 0, configs: 0, quota: 0, analytics: 0 }, 'Deletion must remove the account and everything it owns')
  assert.deepEqual(await ownedCounts(owner), ownerBefore, 'Deleting one account must not touch another account')
  assert.equal((await historian('/api/conversations')).status, 401, 'A self-deleted account must not retain access through its session token')
  assert.equal((await deleteAccount(historian, { confirmEmail: historianEmail, password })).status, 401)
  console.log(JSON.stringify({ passed: ['real credential authentication', 'unauthenticated denial', 'cross-origin mutation denial', 'parallel responses and isolated failure', 'provider token usage', 'durable reload ordering', 'idempotent replay', 'conflicting request denial', 'cross-account read/update/delete/generation denial', 'duplicate user turn prevention', 'regeneration', 'truncated stream failure', 'cancel and save partial response', 'unique usage ledger', 'expired lease recovery preserves checkpoint', ...(process.env.LLM_MONTHLY_REQUEST_LIMITS ? ['concurrent quota reservations'] : []), 'durable batch orchestration and replay', 'owned paginated history', 'server-assembled model context', 'owned turn-aligned message pagination', 'persisted account profile and strict field validation', 'owned consistent account archive', 'atomic archive restore and replay without billing or generation writes', 'deleted account session revocation', 'self-serve account deletion with cascade, refusal paths and rate limit', 'plan usage, secret-free account data export and public pages'], providerCalls }))
} finally {
  modelApi.closeAllConnections()
  if (modelApi.listening) await new Promise(resolve => modelApi.close(resolve))
  await db.query('DELETE FROM "User" WHERE id = ANY($1::text[])', [[owner, outsider, historianId]])
  await db.query('DELETE FROM "Analytics" WHERE "userId" = ANY($1::text[])', [[owner, outsider, historianId]])
  await db.end()
}
