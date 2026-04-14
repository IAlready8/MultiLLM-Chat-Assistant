/**
 * prisma/seed.ts - Database seed for local development
 *
 * Creates the demo account, guest user, welcome conversation, and default persona.
 * Idempotent - safe to re-run. Uses upsert throughout.
 *
 * Run via: npm run db:seed
 */

import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const DEMO_EMAIL    = process.env.DEMO_ACCOUNT_EMAIL    || 'demo@local.dev'
const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD || 'demo12345'
const DEMO_NAME     = process.env.DEMO_ACCOUNT_NAME     || 'Demo User'
const DEMO_ID       = process.env.DEMO_ACCOUNT_ID       || 'demo-user'
const GUEST_EMAIL   = process.env.GUEST_USER_EMAIL      || 'guest@local.dev'
const GUEST_NAME    = process.env.GUEST_USER_NAME       || 'Guest User'
const GUEST_ID      = process.env.GUEST_USER_ID         || 'guest-local-user'
const BCRYPT_ROUNDS = 10

const prisma = new PrismaClient({ log: ['warn', 'error'] })

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

async function seedDemoUser(): Promise<void> {
  const hashedPassword = await hashPassword(DEMO_PASSWORD)

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: DEMO_NAME, password: hashedPassword },
    create: {
      id: DEMO_ID, email: DEMO_EMAIL, name: DEMO_NAME,
      password: hashedPassword, emailVerified: new Date(),
    },
  })
  console.log(`[seed] demo user upserted: ${user.email} (id=${user.id})`)

  // Ensure default subscription
  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, tier: 'FREE' },
  })
  console.log('[seed] demo subscription ensured')

  // Ensure welcome persona
  await prisma.persona.upsert({
    where: { id: `${DEMO_ID}-persona-default` },
    update: {},
    create: {
      id: `${DEMO_ID}-persona-default`, userId: user.id,
      title: 'General Assistant',
      description: 'Balanced, helpful assistant for everyday tasks.',
      prompt: 'You are a helpful, concise, and accurate assistant. Respond clearly and directly. Ask clarifying questions when the request is ambiguous.',
    },
  })
  console.log('[seed] default persona ensured')

  // Seed welcome conversation if none exists
  const existingConv = await prisma.conversation.findFirst({ where: { userId: user.id } })
  if (!existingConv) {
    const conv = await prisma.conversation.create({
      data: {
        userId: user.id, title: 'Welcome to MultiLLM',
        messages: {
          create: [
            { role: 'user', content: 'Hello! What can you do?' },
            {
              role: 'assistant',
              content: 'Welcome! I can help you chat with multiple LLM providers (OpenAI, Anthropic, Google AI, OpenRouter, Grok, Ollama, Mistral) from a single interface. Add your API keys in Settings to get started.',
              provider: 'system', model: 'seed',
            },
          ],
        },
      },
    })
    console.log(`[seed] welcome conversation created (id=${conv.id})`)
  } else {
    console.log('[seed] conversation already exists, skipping')
  }
}

async function seedGuestUser(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: GUEST_EMAIL },
    update: { name: GUEST_NAME },
    create: { id: GUEST_ID, email: GUEST_EMAIL, name: GUEST_NAME, emailVerified: null },
  })
  console.log(`[seed] guest user upserted: ${user.email} (id=${user.id})`)
}

async function main(): Promise<void> {
  console.log('[seed] starting...')
  await seedDemoUser()
  await seedGuestUser()
  console.log('[seed] complete')
}

main()
  .catch((e) => { console.error('[seed] error:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
