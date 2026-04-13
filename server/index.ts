import Fastify, { FastifyRequest, FastifyReply } from 'fastify'
import 'dotenv/config'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
// @ts-ignore — types available after npm install
import rateLimit from '@fastify/rate-limit'
import { CreateItemRequest, UpdateItemRequest, RegisterRequest, LoginRequest } from '@circular/shared'
import { PrismaClient, Category as PrismaCategory, ItemStatus } from './generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { runWasteLogic } from './wasteLogic'
import { calculateSustainability } from './sustainabilityLogic'

// ─── Environment Check ───────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL is missing from .env!')
  process.exit(1)
}
if (!process.env.JWT_SECRET) {
  console.error('❌ ERROR: JWT_SECRET is missing from .env!')
  process.exit(1)
}

const JWT_SECRET = process.env.JWT_SECRET as string
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

// ─── Rate Limiting ────────────────────────────────────────────────────────────

// Register global rate-limit plugin; auth routes get a stricter per-route override
await fastify.register(rateLimit, {
  global: false, // opt-in per route
})

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

fastify.post<{ Body: RegisterRequest }>('/auth/register', {
  config: {
    rateLimit: {
      max: 10,          // max 10 registrations
      timeWindow: '1 hour',
    },
  },
},async (request, reply) => {
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

fastify.post<{ Body: LoginRequest }>('/auth/login', {
  config: {
    rateLimit: {
      max: 20,           // 20 attempts per 15 minutes per IP
      timeWindow: '15 minutes',
      errorResponseBuilder: () => ({
        error: 'Too many login attempts. Please wait 15 minutes and try again.',
      }),
    },
  },
}, async (request, reply) => {
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

// ─── 3. POST /auth/change-password ──────────────────────────────────────────

fastify.post('/auth/change-password', async (request, reply) => {
  const user = authenticate(request, reply)
  if (!user) return

  const { currentPassword, newPassword } = request.body as { currentPassword: string; newPassword: string }
  if (!currentPassword || !newPassword) {
    return reply.status(400).send({ error: 'currentPassword and newPassword are required' })
  }
  if (newPassword.length < 8) {
    return reply.status(400).send({ error: 'New password must be at least 8 characters' })
  }

  try {
    const dbUser = await prisma.user.findUnique({ where: { id: user.userId } })
    if (!dbUser) return reply.status(404).send({ error: 'User not found' })

    const match = await bcrypt.compare(currentPassword, dbUser.passwordHash)
    if (!match) return reply.status(401).send({ error: 'Current password is incorrect' })

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
    await prisma.user.update({ where: { id: user.userId }, data: { passwordHash } })
    return { success: true }
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Password change failed' })
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
    const sustainability = await calculateSustainability(prisma, user.userId)
    return { items, totalCount: items.length, globalSustainability: sustainability }
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

  const { name, category, weight, barcode, imageUrl } = request.body

  if (!name || !category || weight == null) {
    return reply.status(400).send({ error: 'name, category, and weight are required' })
  }
  if (typeof weight !== 'number' || weight <= 0) {
    return reply.status(400).send({ error: 'weight must be a number greater than 0' })
  }

  try {
    const newItem = await prisma.inventoryItem.create({
      data: {
        name,
        category: normalizeCategory(category),
        weight,
        barcode,
        imageUrl,
        userId: user.userId,
      },
    })
    // Log creation event
    await (prisma as any).itemActivityLog.create({
      data: { itemId: newItem.id, event: 'added', detail: `${name} (${category}, ${weight}kg)` }
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

    const { name, category, weight, barcode, imageUrl, status } = request.body

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
          ...(barcode !== undefined && barcode !== existing.barcode && { barcode }),
          ...(imageUrl !== undefined && { imageUrl }),
          ...(status !== undefined && { status: normalizeStatus(status) }),
          lastAccessedAt: new Date(),
        },
      })
      // Log edit/status-change activity (existing fields are Prisma enums, normalize for comparison)
      const details: string[] = []
      if (status !== undefined && normalizeStatus(status) !== existing.status) {
        details.push(`Status: ${existing.status} → ${normalizeStatus(status)}`)
        await (prisma as any).itemActivityLog.create({ data: { itemId: existing.id, event: 'status_changed', detail: details[0] } })
      } else if (name !== undefined || category !== undefined || weight !== undefined) {
        if (name && name !== existing.name) details.push(`Name: ${existing.name} → ${name}`)
        if (category && normalizeCategory(category) !== existing.category) details.push(`Category: ${existing.category} → ${normalizeCategory(category)}`)
        if (weight !== undefined && weight !== existing.weight) details.push(`Weight: ${existing.weight}kg → ${weight}kg`)
        await (prisma as any).itemActivityLog.create({ data: { itemId: existing.id, event: 'edited', detail: details.join(', ') || 'Updated' } })
      } else {
        await (prisma as any).itemActivityLog.create({ data: { itemId: existing.id, event: 'accessed' } })
      }
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

    // Note: activity logs are cascade-deleted with the item
    await prisma.inventoryItem.delete({ where: { id: request.params.id } })
    return reply.status(204).send()
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to delete item' })
  }
})

// ─── 9. GET /api/sustainability ──────────────────────────────────────────────

fastify.get('/api/sustainability', async (request, reply) => {
  const user = authenticate(request, reply)
  if (!user) return
  try {
    const result = await calculateSustainability(prisma, user.userId)
    return result
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to calculate sustainability score' })
  }
})

// ─── 10. POST /api/admin/run-waste-logic ─────────────────────────────────────

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

// ─── 11. GET /api/items/:id/history ─────────────────────────────────────────

fastify.get<{ Params: { id: string } }>('/api/items/:id/history', async (request, reply) => {
  const user = authenticate(request, reply)
  if (!user) return

  try {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: request.params.id, userId: user.userId },
    })
    if (!item) return reply.status(404).send({ error: 'Item not found' })

    const logs = await (prisma as any).itemActivityLog.findMany({
      where: { itemId: request.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { logs }
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Failed to fetch activity history' })
  }
})

// ─── 13. GET /api/barcode/:code — OpenFoodFacts lookup ───────────────────────

fastify.get<{ Params: { code: string } }>('/api/barcode/:code', async (request, reply) => {
  const user = authenticate(request, reply)
  if (!user) return

  const { code } = request.params
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
      { headers: { 'User-Agent': 'CircularTracker/1.0 (contact@circular.app)' } }
    )
    if (!res.ok) return reply.status(502).send({ error: 'OpenFoodFacts unavailable' })

    const data = await res.json() as any
    if (data.status !== 1 || !data.product) {
      return reply.status(404).send({ error: 'Product not found' })
    }

    const product = data.product
    const name: string = product.product_name || product.product_name_en || ''
    // Map OpenFoodFacts categories to our Category enum (best-effort)
    const rawCategories: string = (product.categories ?? '').toLowerCase()
    let category = 'Other'
    if (rawCategories.includes('textile') || rawCategories.includes('cloth') || rawCategories.includes('fabric')) category = 'Textile'
    else if (rawCategories.includes('wood') || rawCategories.includes('timber')) category = 'Wood'
    else if (rawCategories.includes('metal') || rawCategories.includes('steel') || rawCategories.includes('alumin')) category = 'Metal'
    else if (rawCategories.includes('plastic') || rawCategories.includes('polyester')) category = 'Plastic'
    else if (rawCategories.includes('glass') || rawCategories.includes('bottle')) category = 'Glass'

    return { name: name.trim(), category, barcode: code }
  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send({ error: 'Barcode lookup failed' })
  }
})

// ─── Cron: Run waste logic every day at midnight ──────────────────────────────

const scheduleWasteLogic = () => {
  const runAt = () => {
    const now = new Date()
    const night = new Date()
    night.setHours(24, 0, 0, 0)
    return night.getTime() - now.getTime()
  }

  const schedule = () => {
    setTimeout(async () => {
      console.log('🕛 Running scheduled waste logic…')
      await runWasteLogic(prisma)
      schedule()
    }, runAt())
  }

  schedule()
  console.log(`⏰ Waste logic cron scheduled (next run at midnight)`)
}

// ─── Start ───────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    console.log('🔄 Running initial waste logic check…')
    await runWasteLogic(prisma)

    scheduleWasteLogic()

    await fastify.listen({ port: 3001, host: '0.0.0.0' })
    console.log('🚀 Server ready at http://localhost:3001')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()