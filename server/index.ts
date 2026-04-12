import Fastify from 'fastify';
import 'dotenv/config';
import { CreateItemRequest } from '@circular/shared';
import { PrismaClient, Category as PrismaCategory } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * 🔍 Environment Check
 */
if (!process.env.DATABASE_URL) {
  console.error("❌ ERROR: DATABASE_URL is missing from .env!");
  process.exit(1);
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const fastify = Fastify({ logger: true });

/**
 * 🛠️ Helper: normalizeCategory
 */
const normalizeCategory = (category: CreateItemRequest['category']): PrismaCategory => {
  return category.toUpperCase() as PrismaCategory;
};

// --- 1. Health Check Route ---
fastify.get('/health', async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'connected' };
  } catch (err) {
    fastify.log.error(err);
    return {
      status: 'error',
      database: 'disconnected',
      message: err instanceof Error ? err.message : 'Unknown connection error',
    };
  }
});

// --- 2. Create Item Route ---
fastify.post<{ Body: CreateItemRequest }>('/api/items', async (request, reply) => {
  const { name, category, weight, barcode } = request.body;

  try {
    const newItem = await prisma.inventoryItem.create({
      data: {
        name,
        category: normalizeCategory(category),
        weight,
        barcode,
      },
    });
    return newItem;
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({
      error: 'Failed to create item',
      message: error instanceof Error ? error.message : 'Database operation failed',
    });
  }
});

/**
 * 🚀 Start the Server
 */
const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    console.log('🚀 Server ready at http://localhost:3001');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();