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

const prisma: PrismaClient = {
  user: createStubDelegate<User>('user'),
  conversation: createStubDelegate<Conversation>('conversation'),
  message: createStubDelegate<Message>('message'),
  persona: createStubDelegate<Persona>('persona'),
  goal: createStubDelegate<Goal>('goal'),
  subscription: createStubDelegate<Subscription>('subscription'),
  analytics: createStubDelegate<Analytics>('analytics'),
  providerConfig: createStubDelegate<any>('providerConfig'),
  team: createStubDelegate<Team>('team'),
  $transaction: async (fn) => fn(prisma),
  $queryRaw: async () => {
    throw new Error('Database access is not available in this environment.')
  },
}

export { prisma }
export default prisma
