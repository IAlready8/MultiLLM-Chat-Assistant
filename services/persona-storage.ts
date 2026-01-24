import { prisma } from '@/lib/prisma';

export interface PersonaData {
  id: string;
  title: string;
  description: string | null;
  prompt: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

export async function savePersona(
  title: string,
  description: string | null,
  prompt: string,
  userId: string
): Promise<string> {
  const persona = await prisma.persona.create({
    data: {
      title,
      description,
      prompt,
      userId,
    },
  });
  return persona.id;
}

export async function getPersonasByUserId(userId: string): Promise<PersonaData[]> {
  const personas = await prisma.persona.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  return personas;
}

export async function getPersona(id: string): Promise<PersonaData | null> {
  const persona = await prisma.persona.findUnique({
    where: { id },
  });
  return persona;
}

export async function updatePersona(
  id: string,
  updates: { title?: string; description?: string | null; prompt?: string }
): Promise<void> {
  await prisma.persona.update({
    where: { id },
    data: updates,
  });
}

export async function deletePersona(id: string): Promise<void> {
  await prisma.persona.delete({
    where: { id },
  });
}
