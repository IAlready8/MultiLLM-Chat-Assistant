import { PrismaClient as PrismaClientRuntime } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
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
  User,
} from '@/types/prisma'

type GlobalPrismaClient = typeof globalThis & {
  __multiLlmPrismaClient?: PrismaClientRuntime
}

const prismaGlobal = globalThis as GlobalPrismaClient

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim())

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

  if (process.env.NODE_ENV !== 'production') {
    prismaGlobal.__multiLlmPrismaClient = client
  }

  return client as unknown as PrismaClient
}

const prisma: PrismaClient = hasDatabaseUrl
  ? createRuntimeClient()
  : createStubClient()

export { prisma }
export default prisma
