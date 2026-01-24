import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

declare global {
  var prisma: PrismaClient | undefined;
  var prismaPool: Pool | undefined;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set. Define it in .env.local or .env.');
}

const pool = global.prismaPool || new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);

// Enhanced Prisma configuration with better logging and optimization
const prisma = global.prisma || new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Enhanced connection management
if (!global.prisma && typeof window === 'undefined') {
  const connectWithRetry = async (maxRetries = 3, delay = 1000) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await prisma.$connect();
        console.log('✅ Database connected successfully');
        return;
      } catch (error) {
        console.error(`❌ Database connection attempt ${i + 1} failed:`, error);
        if (i === maxRetries - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      }
    }
  };

  // Connect with retry logic (skip in production build to avoid build failures)
  if (process.env.NODE_ENV !== 'production' || process.env.DATABASE_URL) {
    connectWithRetry().catch(console.error);
  }
}

// Graceful shutdown handling
if (typeof window === 'undefined') {
  const gracefulShutdown = async () => {
    console.log('🔄 Gracefully shutting down database connection...');
    await prisma.$disconnect();
    console.log('✅ Database disconnected successfully');
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
  process.on('beforeExit', gracefulShutdown);
}

if (process.env.NODE_ENV === 'development') {
  global.prisma = prisma;
  global.prismaPool = pool;
}

export { prisma };
export default prisma;
