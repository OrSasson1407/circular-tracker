import { PrismaClient, Category, ItemStatus } from './generated/prisma/client'

/**
 * 🗓️ Stale thresholds per category (in days)
 * Different materials have different "shelf lives" before they become waste risk.
 */
const THRESHOLDS_DAYS: Record<Category, number> = {
  TEXTILE:  60,   // Clothes/fabric go stale faster
  WOOD:     120,  // Wood lasts longer
  METAL:    180,  // Metal is very durable
  PLASTIC:  90,
  GLASS:    120,
  OTHER:    60,
}

// Max updates to send in a single $transaction to avoid exhausting the DB connection pool
const CHUNK_SIZE = 100

/**
 * ♻️ runWasteLogic
 * Recalculates riskLevel for every ACTIVE item and marks as STALE if risk >= 1.0
 * Formula: Risk = (today - lastAccessedAt) / threshold
 */
export async function runWasteLogic(prisma: PrismaClient): Promise<void> {
  const now = new Date()

  // Only process items that are still active — skip Donated/Recycled
  const activeItems = await prisma.inventoryItem.findMany({
    where: { status: { in: [ItemStatus.ACTIVE, ItemStatus.STALE] } },
  })

  if (activeItems.length === 0) {
    console.log('⏭️  Waste logic: no active items to process.')
    return
  }

  let markedStale = 0
  let markedActive = 0

  // Compute all new values first, without touching the DB
  const payloads = activeItems.map((item) => {
    const thresholdDays = THRESHOLDS_DAYS[item.category]
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000
    const daysSinceAccess = now.getTime() - new Date(item.lastAccessedAt).getTime()
    const riskLevel = Math.min(daysSinceAccess / thresholdMs, 1.5) // cap at 1.5

    const newStatus: ItemStatus =
      riskLevel >= 1.0 ? ItemStatus.STALE : ItemStatus.ACTIVE

    if (newStatus === ItemStatus.STALE && item.status !== ItemStatus.STALE) markedStale++
    if (newStatus === ItemStatus.ACTIVE && item.status === ItemStatus.STALE) markedActive++

    return { id: item.id, riskLevel, status: newStatus }
  })

  // Write in chunks of CHUNK_SIZE — each chunk is a single atomic transaction,
  // keeping individual transaction sizes small and connection pool usage bounded
  for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
    const chunk = payloads.slice(i, i + CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map(({ id, riskLevel, status }) =>
        prisma.inventoryItem.update({ where: { id }, data: { riskLevel, status } })
      )
    )
  }

  console.log(
    `✅ Waste logic complete: ${activeItems.length} items processed, ` +
    `${markedStale} newly stale, ${markedActive} recovered to active.`
  )
}