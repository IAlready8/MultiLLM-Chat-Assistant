import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { PersonaService } from '@/services/persona-service.db'
import { z } from 'zod'

// Zod schema for persona validation
const personaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  title: z.string().min(1, 'Name is required').max(100).optional(),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(1, 'System prompt is required').max(5000).optional(),
  prompt: z.string().min(1, 'System prompt is required').max(5000).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
}).superRefine((value, context) => {
  if (!(value.name ?? value.title)?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Name is required',
      path: ['name'],
    })
  }

  if (!(value.systemPrompt ?? value.prompt)?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'System prompt is required',
      path: ['systemPrompt'],
    })
  }
})

/**
 * GET /api/personas
 * Retrieves all personas for the authenticated user.
 */
export async function GET(_req: Request) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const personas = await PersonaService.getPersonasByUserId(user.id)
    return NextResponse.json(personas)
  } catch (error) {
    console.error('Error loading personas:', error)
    return NextResponse.json({ error: 'Failed to load personas' }, { status: 500 })
  }
}

/**
 * POST /api/personas
 * Creates a new persona for the authenticated user.
 */
export async function POST(req: Request) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
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
    const title = (validation.data.name ?? validation.data.title)?.trim() || ''
    const prompt =
      (validation.data.systemPrompt ?? validation.data.prompt)?.trim() || ''
    const { description } = validation.data
    const personaData = {
      title,
      prompt,
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
