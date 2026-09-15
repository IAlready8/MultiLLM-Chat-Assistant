import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/api-auth'
import { readApiObject } from '@/lib/api-input'
import prisma from '@/lib/prisma'

const schema = z.object({ name: z.string().trim().min(1).max(100) }).strict()
const profile = (user: { name?: string | null; email?: string | null }) => ({
  name: user.name ?? '', email: user.email ?? '',
})

export async function GET() {
  const auth = await getAuthenticatedUser()
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(profile(auth.user), { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser()
  if (auth instanceof NextResponse) return auth
  const body = await readApiObject(request)
  if (body instanceof NextResponse) return body
  const input = schema.safeParse(body)
  if (!input.success) return NextResponse.json({ error: 'Provide a name of 1–100 characters. Other account fields cannot be changed here.' }, { status: 400 })
  try {
    const user = await prisma.user.update({
      where: { id: auth.user.id }, data: { name: input.data.name },
      select: { name: true, email: true },
    })
    return NextResponse.json(profile(user), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to save your profile. Please retry.' }, { status: 503 })
  }
}
