import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { getUserProviderConfigCount } from '@/lib/api-key-service'
import { createGuestUserRecord, getDemoAccountContext } from '@/lib/demo-account'
import { PersonaService } from '@/services/persona-service.db'
import { ConversationService } from '@/services/conversation-service.db'

export async function GET() {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const demoAccount = getDemoAccountContext()
  const guestUser = createGuestUserRecord()
  const isSharedGuestOrDemoUser =
    user.id === guestUser.id ||
    user.id === demoAccount.id ||
    user.email === guestUser.email ||
    user.email === demoAccount.email

  if (isSharedGuestOrDemoUser) {
    const response = NextResponse.json({
      configuredProviders: 0,
      personas: 0,
      comparisonReadyConversations: 0,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

  try {
    const [configuredProviders, personas, comparisonReadyConversations] =
      await Promise.all([
        getUserProviderConfigCount(user.id),
        PersonaService.getPersonaCountByUserId(user.id),
        ConversationService.getComparisonReadyConversationCountByUserId(user.id),
      ])

    const response = NextResponse.json({
      configuredProviders,
      personas,
      comparisonReadyConversations,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('Failed to load activation state:', error)
    return NextResponse.json(
      { error: 'Failed to load activation state' },
      { status: 500 }
    )
  }
}
