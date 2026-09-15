import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { getUserProviderConfigCount } from '@/lib/api-key-service'
import { PersonaService } from '@/services/persona-service.db'
import { ConversationService } from '@/services/conversation-service.db'

export async function GET() {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

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
