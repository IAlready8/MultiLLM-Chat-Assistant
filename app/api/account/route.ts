import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'

/** Old email-only deletion is retired; verification lives in the durable flow. */
export async function DELETE() {
  const auth = await getAuthenticatedUser({ allowAccountDeletion: true })
  if (auth instanceof NextResponse) return auth
  return NextResponse.json({ error: 'Verify your identity in Settings to delete your account.', code: 'DELETION_VERIFICATION_REQUIRED', url: '/account/deletion' }, { status: 410, headers: { 'Cache-Control': 'no-store' } })
}
