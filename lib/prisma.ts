import { PrismaClient as PrismaClientRuntime } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { validateStartupEnvironment } from '@/lib/startup-validation'
import type {
  Analytics,
  Conversation,
  Goal,
  Message,
  Persona,
  PrismaClient,
  PrismaModelDelegate,
  Subscription,
  Team,
  TeamMember,
  User,
} from '@/types/prisma'

type GlobalPrismaClient = typeof globalThis & {
  __multiLlmPrismaClient?: PrismaClientRuntime
}

const prismaGlobal = globalThis as GlobalPrismaClient

validateStartupEnvironment()
const isProduction = process.env.NODE_ENV === 'production'
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim())

if (isProduction && !hasDatabaseUrl) {
  throw new Error(
    'DATABASE_URL is required in production. In-memory/stub database fallback is disabled.'
  )
}

const createStubDelegate = <T>(label: string): PrismaModelDelegate<T> => {
  const error = async () => {
    throw new Error(`Database access for ${label} is not available in this environment.`)
  }

  return {
    findMany: error,
    findFirst: error,
    findUnique: error,
    create: error,
    update: error,
    delete: error,
    deleteMany: async () => ({ count: 0 }),
    upsert: error,
    updateMany: async () => ({ count: 0 }),
  }
}

const createStubClient = (): PrismaClient => {
  const stub = {
    user: createStubDelegate<User>('user'),
    conversation: createStubDelegate<Conversation>('conversation'),
    message: createStubDelegate<Message>('message'),
    persona: createStubDelegate<Persona>('persona'),
    goal: createStubDelegate<Goal>('goal'),
    subscription: createStubDelegate<Subscription>('subscription'),
    analytics: createStubDelegate<Analytics>('analytics'),
    providerConfig: createStubDelegate<any>('providerConfig'),
    team: createStubDelegate<Team>('team'),
    teamMember: createStubDelegate<TeamMember>('teamMember'),
    $transaction: async <T>(fn: (tx: PrismaClient) => Promise<T>) =>
      fn(stub as PrismaClient),
    $queryRaw: async () => {
      throw new Error('Database access is not available in this environment.')
    },
  }

  return stub as PrismaClient
}

const createRuntimeClient = (): PrismaClient => {
  if (prismaGlobal.__multiLlmPrismaClient) {
    return prismaGlobal.__multiLlmPrismaClient as unknown as PrismaClient
  }

  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) {
    return createStubClient()
  }

  const adapter = new PrismaPg({ connectionString })
  const client = new PrismaClientRuntime({ adapter })

  if (!isProduction) {
    prismaGlobal.__multiLlmPrismaClient = client
  }

  return client as unknown as PrismaClient
}

const prisma: PrismaClient = hasDatabaseUrl
  ? createRuntimeClient()
  : createStubClient()

export { prisma }
export default prisma
