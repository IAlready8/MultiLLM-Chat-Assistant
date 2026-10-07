import { describe, expect, it } from 'vitest'
import { previewMigrationUrl } from '../scripts/build-deployment.mjs'

const env = { VERCEL_ENV: 'preview', PREVIEW_MIGRATION_HOST: 'staging.example.test', PREVIEW_MIGRATION_BRANCH: 'feature', VERCEL_GIT_COMMIT_REF: 'feature', DATABASE_URL: 'postgresql://test:test@staging.example.test/db' }
describe('preview migration guard', () => {
  it('only admits the exact staging branch and database', () => {
    expect(previewMigrationUrl(env)).toBe(env.DATABASE_URL)
    expect(() => previewMigrationUrl({ ...env, DATABASE_URL: 'postgresql://test:test@production.example.test/db' })).toThrow()
    expect(() => previewMigrationUrl({ ...env, VERCEL_GIT_COMMIT_REF: 'main' })).toThrow()
    expect(() => previewMigrationUrl({ ...env, PREVIEW_MIGRATION_BRANCH: '' })).toThrow()
  })
  it('never runs migrations during production or ordinary builds', () => {
    expect(previewMigrationUrl({ ...env, VERCEL_ENV: 'production' })).toBeNull()
    expect(previewMigrationUrl({})).toBeNull()
  })
})
