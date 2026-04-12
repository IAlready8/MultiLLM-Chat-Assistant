import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const getEnv = (key: string, fallback: string): string =>
  (process.env[key] || fallback).trim()

async function main(): Promise<void> {
  const demoEmail = getEnv('DEMO_ACCOUNT_EMAIL', 'demo@local.dev').toLowerCase()
  const demoName = getEnv('DEMO_ACCOUNT_NAME', 'Demo User')
  const demoPassword = getEnv('DEMO_ACCOUNT_PASSWORD', 'demo12345')

  const guestEmail = getEnv('GUEST_USER_EMAIL', 'guest@local.dev').toLowerCase()
  const guestName = getEnv('GUEST_USER_NAME', 'Guest User')

  const demoHash = await bcrypt.hash(demoPassword, 10)

  await prisma.user.upsert({
    where: { email: demoEmail },
    update: {
      name: demoName,
      password: demoHash,
    },
    create: {
      name: demoName,
      email: demoEmail,
      password: demoHash,
    },
  })

  await prisma.user.upsert({
    where: { email: guestEmail },
    update: {
      name: guestName,
      password: null,
    },
    create: {
      name: guestName,
      email: guestEmail,
      password: null,
    },
  })

  console.log(`Seeded demo user: ${demoEmail}`)
  console.log(`Seeded guest user: ${guestEmail}`)
}

main()
  .catch((error) => {
    console.error('Failed to seed database:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
