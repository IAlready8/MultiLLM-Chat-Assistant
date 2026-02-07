import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { PersonaService } from '@/services/persona-service.db'
import { z } from 'zod'

// Zod schema for updating a persona
const updatePersonaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  title: z.string().min(1, 'Name is required').max(100).optional(),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(1, 'System prompt is required').max(5000).optional(),
  prompt: z.string().min(1, 'System prompt is required').max(5000).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
})

/**
 * GET /api/personas/[id]
 * Retrieves a single persona by ID for the authenticated user.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const { id } = params
    const persona = await PersonaService.getPersonaById(id, user.id)

    if (!persona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    }

    return NextResponse.json(persona)
  } catch (error) {
    console.error('Error loading persona:', error)
    return NextResponse.json({ error: 'Failed to load persona' }, { status: 500 })
  }
}

/**
 * PUT /api/personas/[id]
 * Updates an existing persona for the authenticated user.
 */
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const { id } = params
    const body = await req.json()
    const validation = updatePersonaSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const updateData = {
      title: validation.data.name ?? validation.data.title,
      description: validation.data.description,
      prompt: validation.data.systemPrompt ?? validation.data.prompt,
    }

    if (
      updateData.title === undefined &&
      updateData.description === undefined &&
      updateData.prompt === undefined
    ) {
      return NextResponse.json(
        { error: 'No updatable persona fields provided' },
        { status: 400 }
      )
    }

    const updatedPersona = await PersonaService.updatePersona(
      id,
      updateData,
      user.id
    )
    
    if (!updatedPersona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    }
    
    return NextResponse.json(updatedPersona)
  } catch (error) {
    console.error('Error updating persona:', error)
    return NextResponse.json({ error: 'Failed to update persona' }, { status: 500 })
  }
}

/**
 * DELETE /api/personas/[id]
 * Deletes a persona for the authenticated user.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const authCheck = await getAuthenticatedUser({ allowGuest: true })
  if (authCheck instanceof NextResponse) return authCheck
  const { user } = authCheck

  try {
    const { id } = params
    const success = await PersonaService.deletePersona(id, user.id)

    if (!success) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error deleting persona:', error)
    return NextResponse.json({ error: 'Failed to delete persona' }, { status: 500 })
  }
}
