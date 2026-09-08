import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium, expect } from '@playwright/test'

export async function testAccountBrowser({ baseUrl, email, password }) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname))
  const browser = await chromium.launch()
  const artifacts = path.join(process.env.RUNNER_TEMP || tmpdir(), 'multillm-browser')
  await mkdir(artifacts, { recursive: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  try {
    await page.goto(new URL('/auth/signin?callbackUrl=%2Fsettings', baseUrl).href)
    await expect(page.getByRole('button', { name: 'Sign in with password', exact: true })).toBeEnabled()
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in with password', exact: true }).click()
    await page.waitForURL('**/settings')
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Persisted account name')
    await expect(page.getByLabel('Sign-in email')).toHaveValue(email)
    await page.getByLabel('Name', { exact: true }).fill('Browser verified profile')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByText('Profile saved to your account.', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Browser verified profile')
    await page.screenshot({ path: path.join(artifacts, 'profile-desktop.png'), fullPage: true })
    await page.getByRole('tab', { name: 'Advanced', exact: true }).click()
    const archivePassword = 'Synthetic archive test password'
    await page.getByLabel('Conversation archive password').fill(archivePassword)
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download conversation archive', exact: true }).click()
    const archive = await downloadEvent
    const archivePath = await archive.path()
    const encrypted = await readFile(archivePath, 'utf8')
    assert.ok(!encrypted.includes('Browser verified profile') && !encrypted.includes('Compare this prompt'))
    await page.getByLabel('Conversation archive password').fill(archivePassword)
    await page.getByLabel('Open an existing archive').setInputFiles({ name: 'history.encrypted', mimeType: 'text/plain', buffer: Buffer.from(encrypted) })
    const jsonEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Open archive as JSON', exact: true }).click()
    const decoded = JSON.parse(await readFile(await (await jsonEvent).path(), 'utf8'))
    assert.equal(decoded.format, 'multillm-conversation-archive')
    assert.equal(decoded.conversations.length, 3)
    assert.ok(decoded.messages.length > 0)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('button', { name: 'Download conversation archive', exact: true })).toBeVisible()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Mobile settings must not overflow horizontally')
    await page.screenshot({ path: path.join(artifacts, 'archive-mobile.png'), fullPage: true })
    assert.deepEqual(errors, [], 'Browser must not report console errors or uncaught exceptions')
    console.log('Browser QA passed: credential sign-in, persisted profile reload, encrypted archive download/decryption, desktop and mobile settings; no console errors')
  } catch (error) {
    console.error('Browser QA diagnostics', { url: page.url(), errors })
    await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => {})
    throw error
  } finally { await browser.close() }
}
