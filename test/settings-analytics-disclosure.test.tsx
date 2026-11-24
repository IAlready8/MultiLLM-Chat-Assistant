import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'

vi.mock('@/components/account-profile-form', () => ({ AccountProfileForm: () => null }))
vi.mock('@/components/change-password-form', () => ({ ChangePasswordForm: () => null }))
vi.mock('@/components/account-history-export', () => ({ AccountHistoryExport: () => null }))
vi.mock('@/components/api-key-form', () => ({ default: () => null }))
vi.mock('@/components/jev-settings-form', () => ({ JevSettingsForm: () => null }))
vi.mock('@/components/export-import-dialog', () => ({ ExportImportDialog: () => null }))

import SettingsPage from '@/app/settings/page'

describe('settings usage analytics disclosure', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
  })

  it('describes server-side usage recording accurately and offers no no-op toggle', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)

    await user.click(screen.getByRole('tab', { name: /advanced/i }))

    const disclosure = await screen.findByTestId('usage-analytics-disclosure')
    expect(disclosure).toHaveTextContent('stored with your account')
    expect(disclosure).toHaveTextContent('Prompt and response text is not part of these events.')
    expect(disclosure).toHaveTextContent('always on and is not anonymous')
    expect(screen.queryByText(/anonymous usage data/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Enable Analytics')).not.toBeInTheDocument()
  })
})
