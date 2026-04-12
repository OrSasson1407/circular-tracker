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

  const updates = activeItems.map(async (item) => {
    const thresholdDays = THRESHOLDS_DAYS[item.category]
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000
    const daysSinceAccess = now.getTime() - new Date(item.lastAccessedAt).getTime()
    const riskLevel = Math.min(daysSinceAccess / thresholdMs, 1.5) // cap at 1.5

    const newStatus: ItemStatus =
      riskLevel >= 1.0 ? ItemStatus.STALE : ItemStatus.ACTIVE

    if (newStatus === ItemStatus.STALE && item.status !== ItemStatus.STALE) markedStale++
    if (newStatus === ItemStatus.ACTIVE && item.status === ItemStatus.STALE) markedActive++

    return prisma.inventoryItem.update({
      where: { id: item.id },
      data: { riskLevel, status: newStatus },
    })
  })

  await Promise.all(updates)

  console.log(
    `✅ Waste logic complete: ${activeItems.length} items processed, ` +
    `${markedStale} newly stale, ${markedActive} recovered to active.`
  )
}