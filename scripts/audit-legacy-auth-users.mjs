import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const connectionString = [
  process.env.DATABASE_URL,
  process.env.POSTGRES_DATABASE_URL,
  process.env.POSTGRES_URL,
]
  .map((value) => value?.trim())
  .find((value) => /^postgres(?:ql)?:\/\//i.test(value ?? ''))

if (!connectionString) {
  console.error(
    'DATABASE_URL or POSTGRES_DATABASE_URL is required for the read-only legacy-auth audit.',
  )
  process.exit(1)
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const legacyUserIds = ['demo-user', 'guest-local-user']
const legacyEmails = ['demo@local.dev', 'guest@local.dev']

try {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { id: { in: legacyUserIds } },
        { email: { in: legacyEmails, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      _count: {
        select: {
          accounts: true,
          sessions: true,
          conversations: true,
          providerConfigs: true,
          goals: true,
          personas: true,
          teamMemberships: true,
        },
      },
      subscription: {
        select: { id: true },
      },
    },
  })

  const analyticsCounts = users.length
    ? await prisma.analytics.groupBy({
        by: ['userId'],
        where: { userId: { in: users.map((user) => user.id) } },
        _count: { _all: true },
      })
    : []
  const analyticsByUserId = new Map(
    analyticsCounts.map((record) => [record.userId, record._count._all]),
  )
  const messageCounts = await Promise.all(
    users.map(async (user) => [
      user.id,
      await prisma.message.count({
        where: { conversation: { userId: user.id } },
      }),
    ]),
  )
  const messagesByUserId = new Map(messageCounts)

  console.log(
    JSON.stringify(
      {
        mode: 'read-only',
        candidateCount: users.length,
        candidates: users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          dependentRecords: {
            ...user._count,
            messages: messagesByUserId.get(user.id) ?? 0,
            subscriptions: user.subscription ? 1 : 0,
            analytics: analyticsByUserId.get(user.id) ?? 0,
          },
        })),
      },
      null,
      2,
    ),
  )
} finally {
  await prisma.$disconnect()
}
