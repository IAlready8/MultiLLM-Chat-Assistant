import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { getUserProviderConfigs } from '@/lib/api-key-service'
import { PersonaService } from '@/services/persona-service.db'
import { ConversationService } from '@/services/conversation-service.db'

export async function GET() {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const [providerConfigs, personas, conversations] = await Promise.all([
      getUserProviderConfigs(user.id),
      PersonaService.getPersonasByUserId(user.id),
      ConversationService.getConversationsByUserId(user.id),
    ])

    const response = NextResponse.json({
      configuredProviders: providerConfigs.length,
      personas: personas.length,
      conversations: conversations.length,
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
