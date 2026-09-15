import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const CONFIRMATION = 'DELETE_LEGACY_AUTH_USER_AND_DATA'
const allowedLegacyEmails = new Set(['demo@local.dev', 'guest@local.dev'])

const readArgument = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]?.trim()
}

const userId = readArgument('--user-id')
const email = readArgument('--email')?.toLowerCase()
const confirmation = readArgument('--confirm')

if (!userId || !email || confirmation !== CONFIRMATION) {
  console.error(
    `Usage: node scripts/delete-legacy-auth-user.mjs --user-id <exact-id> --email <exact-email> --confirm ${CONFIRMATION}`,
  )
  process.exit(1)
}

if (!allowedLegacyEmails.has(email)) {
  console.error(
    `Refusing to delete: --email must be an approved legacy identity (${[
      ...allowedLegacyEmails,
    ].join(', ')}).`,
  )
  process.exit(1)
}

const connectionString = [
  process.env.DATABASE_URL,
  process.env.POSTGRES_DATABASE_URL,
  process.env.POSTGRES_URL,
]
  .map((value) => value?.trim())
  .find((value) => /^postgres(?:ql)?:\/\//i.test(value ?? ''))

if (!connectionString) {
  console.error(
    'DATABASE_URL or POSTGRES_DATABASE_URL is required for legacy-auth deletion.',
  )
  process.exit(1)
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const dependentRecordCounts = async (client, targetUserId) => {
  const [
    accounts,
    sessions,
    conversations,
    messages,
    providerConfigs,
    goals,
    personas,
    teamMemberships,
    subscriptions,
    analytics,
  ] = await Promise.all([
    client.account.count({ where: { userId: targetUserId } }),
    client.session.count({ where: { userId: targetUserId } }),
    client.conversation.count({ where: { userId: targetUserId } }),
    client.message.count({
      where: { conversation: { userId: targetUserId } },
    }),
    client.providerConfig.count({ where: { userId: targetUserId } }),
    client.goal.count({ where: { userId: targetUserId } }),
    client.persona.count({ where: { userId: targetUserId } }),
    client.teamMember.count({ where: { userId: targetUserId } }),
    client.subscription.count({ where: { userId: targetUserId } }),
    client.analytics.count({ where: { userId: targetUserId } }),
  ])

  return {
    accounts,
    sessions,
    conversations,
    messages,
    providerConfigs,
    goals,
    personas,
    teamMemberships,
    subscriptions,
    analytics,
  }
}

try {
  const deletion = await prisma.$transaction(async (transaction) => {
    const target = await transaction.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    })

    if (!target || target.email?.toLowerCase() !== email) {
      throw new Error(
        'Refusing to delete: the exact user ID and email do not identify the same database row.',
      )
    }

    const dependentRecords = await dependentRecordCounts(transaction, target.id)
    const deletedAnalytics = await transaction.analytics.deleteMany({
      where: { userId: target.id },
    })
    await transaction.user.delete({ where: { id: target.id } })

    if (deletedAnalytics.count !== dependentRecords.analytics) {
      throw new Error('Analytics deletion count changed during the transaction.')
    }

    return { target, dependentRecords }
  })

  const [remainingUsers, remainingAnalytics, remainingDependents] =
    await Promise.all([
      prisma.user.count({ where: { id: userId } }),
      prisma.analytics.count({ where: { userId } }),
      dependentRecordCounts(prisma, userId),
    ])

  const remainingRecordCount = Object.values(remainingDependents).reduce(
    (total, count) => total + count,
    0,
  )

  if (remainingUsers !== 0 || remainingAnalytics !== 0 || remainingRecordCount !== 0) {
    throw new Error('Post-delete verification found remaining legacy-user data.')
  }

  console.log(
    JSON.stringify(
      {
        mode: 'delete',
        deletedUser: deletion.target,
        deletedDependentRecords: deletion.dependentRecords,
        verification: {
          users: remainingUsers,
          dependentRecords: remainingDependents,
        },
      },
      null,
      2,
    ),
  )
} finally {
  await prisma.$disconnect()
}
