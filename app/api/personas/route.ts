import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { PersonaService } from '@/services/persona-service.db'
import { z } from 'zod'

// Zod schema for persona validation
const personaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(1, 'System prompt is required').max(5000),
  provider: z.string().optional(),
  model: z.string().optional(),
})

/**
 * GET /api/personas
 * Retrieves all personas for the authenticated user.
 */
export async function GET(req: Request) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const personas = await PersonaService.getPersonasByUserId(user.id)
  return NextResponse.json(personas)
}

/**
 * POST /api/personas
 * Creates a new persona for the authenticated user.
 */
export async function POST(req: Request) {
  const authCheck = await getAuthenticatedUser()
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  const body = await req.json()
  const validation = personaSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.flatten() },
      { status: 400 }
    )
  }

  try {
    // Map route fields to Prisma model fields
    const { name, systemPrompt, description } = validation.data
    const personaData = {
      title: name,
      prompt: systemPrompt,
      description: description ?? null,
    }
    const newPersona = await PersonaService.createPersona(personaData, user.id)
    return NextResponse.json(newPersona, { status: 201 })
  } catch (error) {
    console.error('Error creating persona:', error)
    return NextResponse.json({ error: 'Failed to create persona' }, { status: 500 })
  }
}

// NOTE: PUT and DELETE would be in /api/personas/[id]/route.ts
// This file is simplified to show GET/POST at the root.