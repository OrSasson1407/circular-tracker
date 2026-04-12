import Fastify, { FastifyRequest, FastifyReply } from 'fastify'
import 'dotenv/config'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { CreateItemRequest, UpdateItemRequest, RegisterRequest, LoginRequest } from '@circular/shared'
import { PrismaClient, Category as PrismaCategory, ItemStatus } from './generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { runWasteLogic } from './wasteLogic'

// ─── Environment Check ───────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL is missing from .env!')
  process.exit(1)
}
if (!process.env.JWT_SECRET) {
  console.error('❌ ERROR: JWT_SECRET is missing from .env!')
  process.exit(1)
}

const JWT_SECRET = process.env.JWT_SECRET
const SALT_ROUNDS = 10

// ─── Prisma Setup ────────────────────────────────────────────────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
const fastify = Fastify({ logger: true })

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normalizeCategory = (category: string): PrismaCategory =>
  category.toUpperCase() as PrismaCategory

const normalizeStatus = (status: string): ItemStatus =>
  status.toUpperCase() as ItemStatus

const authenticate = (request: FastifyRequest, reply: FastifyReply): { userId: string; email: string } | null => {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Missing or invalid Authorization header' })
    return null
  }
  try {
    const token = authHeader.split(' ')[1]
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string }
  } catch {
    reply.status(401).send({ error: 'Invalid or expired token' })
    return null
  }
}

// ─── 1. Health Check ─────────────────────────────────────────────────────────

fastify.get('/health', async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'ok', database: 'connected' }
  } catch (err) {
    fastify.log.error(err)
    return { status: 'error', database: 'disconnected' }
  }
})

// ─── 2. POST /auth/register ──────────────────────────────────────────────────

fastify.post<{ Body: RegisterRequest }>('/auth/register', async (request, reply) => {
  const { email, password, businessName } = request.body

  if (!email || !password || !businessName) {
    return reply.status(400).send({ error: 'email, password, and businessName are required' })
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return reply.status(409).send({ error: 'A user with this email already exists' })

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const user = await prisma.user.create({ data: { email, passwordHash, businessName } })
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })

    return reply.status(201).send({
      token,
      user: { id: user.id, email: user.email, businessName: user.businessName },
    })
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Registration failed' })
  }
})

// ─── 3. POST /auth/login ─────────────────────────────────────────────────────

fastify.post<{ Body: LoginRequest }>('/auth/login', async (request, reply) => {
  const { email, password } = request.body

  if (!email || !password) {
    return reply.status(400).send({ error: 'email and password are required' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return reply.status(401).send({ error: 'Invalid email or password' })

    const passwordMatch = await bcrypt.compare(password, user.passwordHash)
    if (!passwordMatch) return reply.status(401).send({ error: 'Invalid email or password' })

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' })

    return reply.send({
      token,
      user: { id: user.id, email: user.email, businessName: user.businessName },
    })
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Login failed' })
  }
})

// ─── 4. GET /api/items ───────────────────────────────────────────────────────

fastify.get<{
  Querystring: { category?: string; status?: string; search?: string }
}>('/api/items', async (request, reply) => {
  const user = authenticate(request, reply)
  if (!user) return

  const { category, status, search } = request.query

  try {
    const items = await prisma.inventoryItem.findMany({
      where: {
        userId: user.userId,
        ...(category && { category: normalizeCategory(category) }),
        ...(status && { status: normalizeStatus(status) }),
        ...(search && { name: { contains: search, mode: 'insensitive' } }),
      },
      orderBy: { addedAt: 'desc' },
    })
    return { items, totalCount: items.length }
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to fetch items' })
  }
})

// ─── 5. GET /api/items/:id ───────────────────────────────────────────────────

fastify.get<{ Params: { id: string } }>('/api/items/:id', async (request, reply) => {
  const user = authenticate(request, reply)
  if (!user) return

  try {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: request.params.id, userId: user.userId },
    })
    if (!item) return reply.status(404).send({ error: 'Item not found' })
    return item
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to fetch item' })
  }
})

// ─── 6. POST /api/items ──────────────────────────────────────────────────────

fastify.post<{ Body: CreateItemRequest }>('/api/items', async (request, reply) => {
  const user = authenticate(request, reply)
  if (!user) return

  const { name, category, weight, barcode } = request.body

  try {
    const newItem = await prisma.inventoryItem.create({
      data: {
        name,
        category: normalizeCategory(category),
        weight,
        barcode,
        userId: user.userId,
      },
    })
    return reply.status(201).send(newItem)
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to create item' })
  }
})

// ─── 7. PUT /api/items/:id ───────────────────────────────────────────────────

fastify.put<{ Params: { id: string }; Body: UpdateItemRequest }>(
  '/api/items/:id',
  async (request, reply) => {
    const user = authenticate(request, reply)
    if (!user) return

    const { name, category, weight, barcode, status } = request.body

    try {
      const existing = await prisma.inventoryItem.findFirst({
        where: { id: request.params.id, userId: user.userId },
      })
      if (!existing) return reply.status(404).send({ error: 'Item not found' })

      const updated = await prisma.inventoryItem.update({
        where: { id: request.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(category !== undefined && { category: normalizeCategory(category) }),
          ...(weight !== undefined && { weight }),
          ...(barcode !== undefined && { barcode }),
          ...(status !== undefined && { status: normalizeStatus(status) }),
          lastAccessedAt: new Date(),
        },
      })
      return updated
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Failed to update item' })
    }
  }
)

// ─── 8. DELETE /api/items/:id ────────────────────────────────────────────────

fastify.delete<{ Params: { id: string } }>('/api/items/:id', async (request, reply) => {
  const user = authenticate(request, reply)
  if (!user) return

  try {
    const existing = await prisma.inventoryItem.findFirst({
      where: { id: request.params.id, userId: user.userId },
    })
    if (!existing) return reply.status(404).send({ error: 'Item not found' })

    await prisma.inventoryItem.delete({ where: { id: request.params.id } })
    return reply.status(204).send()
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to delete item' })
  }
})

// ─── 9. POST /api/admin/run-waste-logic ──────────────────────────────────────
// Manual trigger endpoint — useful for testing without waiting for the cron

fastify.post('/api/admin/run-waste-logic', async (request, reply) => {
  const user = authenticate(request, reply)
  if (!user) return
  try {
    await runWasteLogic(prisma)
    return { success: true, message: 'Waste logic executed' }
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Waste logic failed' })
  }
})

// ─── Cron: Run waste logic every day at midnight ──────────────────────────────

const scheduleWasteLogic = () => {
  const runAt = () => {
    const now = new Date()
    const night = new Date()
    night.setHours(24, 0, 0, 0) // next midnight
    return night.getTime() - now.getTime()
  }

  const schedule = () => {
    setTimeout(async () => {
      console.log('🕛 Running scheduled waste logic…')
      await runWasteLogic(prisma)
      schedule() // reschedule for next midnight
    }, runAt())
  }

  schedule()
  console.log(`⏰ Waste logic cron scheduled (next run at midnight)`)
}

// ─── Start ───────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    // Run once on startup to ensure risk levels are fresh
    console.log('🔄 Running initial waste logic check…')
    await runWasteLogic(prisma)

    // Schedule daily runs
    scheduleWasteLogic()

    await fastify.listen({ port: 3001, host: '0.0.0.0' })
    console.log('🚀 Server ready at http://localhost:3001')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()