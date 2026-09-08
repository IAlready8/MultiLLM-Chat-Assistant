export interface BaseModel {
  id: string
  createdAt: Date
  updatedAt: Date
}

export interface User extends BaseModel {
  name?: string | null
  email?: string | null
  emailVerified?: Date | null
  image?: string | null
  password?: string | null
}

export type MessageRole = 'user' | 'assistant' | 'system'

export interface Conversation extends BaseModel {
  title: string
  userId: string
}

export interface Generation {
  leaseExpiresAt: Date
  id: string
  requestHash: string
  userId: string
  conversationId: string
  messageId: string
  message?: Message
  status: string
  promptTokens: number
  completionTokens: number
  usageSource: string
  createdAt: Date
  updatedAt: Date
}

export interface Message {
  clientId?: string | null
  instanceId?: string | null
  turnId?: string | null
  position?: number | null
  generationStatus?: string
  id: string
  role: MessageRole
  content: string
  provider?: string | null
  model?: string | null
  createdAt: Date
  conversationId: string
}

export interface Persona extends BaseModel {
  title: string
  description?: string | null
  prompt: string
  userId: string
}

export interface Goal extends BaseModel {
  title: string
  description?: string | null
  status: string
  userId: string
}

export interface Team extends BaseModel {
  name: string
}

export interface Subscription {
  id: string
  userId: string
  tier: string
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  stripePriceId?: string | null
  stripeCurrentPeriodEnd?: Date | null
  stripeStatus?: string | null
  stripeCancelAtPeriodEnd: boolean
}

export interface Analytics extends BaseModel {
  event: string
  payload?: string | null
  userId: string
}

export type PrismaModelDelegate<T> = {
  findMany: (...args: any[]) => Promise<T[]>
  findFirst: (...args: any[]) => Promise<T | null>
  findUnique: (...args: any[]) => Promise<T | null>
  count: (...args: any[]) => Promise<number>
  create: (...args: any[]) => Promise<T>
  update: (...args: any[]) => Promise<T>
  delete: (...args: any[]) => Promise<T>
  deleteMany: (...args: any[]) => Promise<{ count: number }>
  upsert: (...args: any[]) => Promise<T>
  updateMany: (...args: any[]) => Promise<{ count: number }>
}

export interface PrismaClient {
  generation: PrismaModelDelegate<Generation>
  stripeWebhookEvent: PrismaModelDelegate<{ id: string; createdAt: Date }>
  user: PrismaModelDelegate<User>
  conversation: PrismaModelDelegate<Conversation>
  message: PrismaModelDelegate<Message>
  persona: PrismaModelDelegate<Persona>
  goal: PrismaModelDelegate<Goal>
  subscription: PrismaModelDelegate<Subscription>
  analytics: PrismaModelDelegate<Analytics>
  providerConfig: PrismaModelDelegate<any>
  team: PrismaModelDelegate<Team>
  $transaction: <T>(fn: (tx: PrismaClient) => Promise<T>, options?: { timeout?: number; maxWait?: number }) => Promise<T>
  $queryRaw: (...args: any[]) => Promise<unknown>
}
