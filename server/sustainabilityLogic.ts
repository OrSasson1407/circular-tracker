import { PrismaClient, Category, ItemStatus } from './generated/prisma/client'
import { SustainabilityScore } from '@circular/shared'

const CO2_PER_KG: Record<Category, number> = {
  TEXTILE:  15.0,
  WOOD:      1.5,
  METAL:    11.0,
  PLASTIC:   6.0,
  GLASS:     0.9,
  OTHER:     2.0,
}

export interface SustainabilityBreakdown {
  category: string
  co2Saved: number
  itemCount: number
  totalWeight: number
}

export interface SustainabilityResult {
  score: SustainabilityScore
  breakdown: SustainabilityBreakdown[]
  totalItemsTracked: number
  totalWeightKg: number
}

function getRank(co2Saved: number): SustainabilityScore['rank'] {
  if (co2Saved >= 500) return 'Green Titan'
  if (co2Saved >= 100) return 'Gold'
  if (co2Saved >= 25)  return 'Silver'
  return 'Bronze'
}

function getPoints(co2Saved: number): number {
  return Math.round(co2Saved * 10)
}

export async function calculateSustainability(
  prisma: PrismaClient,
  userId: string
): Promise<SustainabilityResult> {
  const items = await prisma.inventoryItem.findMany({
    where: { userId },
    select: { category: true, weight: true, status: true },
  })

  const byCategory: Record<string, { count: number; weight: number; category: Category }> = {}

  for (const item of items) {
    const key = item.category
    if (!byCategory[key]) byCategory[key] = { count: 0, weight: 0, category: item.category }
    byCategory[key].count++
    byCategory[key].weight += item.weight
  }

  const breakdown: SustainabilityBreakdown[] = Object.entries(byCategory).map(([, data]) => {
    const co2Saved = data.weight * CO2_PER_KG[data.category]
    return {
      category: data.category.charAt(0) + data.category.slice(1).toLowerCase(),
      co2Saved: Math.round(co2Saved * 10) / 10,
      itemCount: data.count,
      totalWeight: Math.round(data.weight * 10) / 10,
    }
  }).sort((a, b) => b.co2Saved - a.co2Saved)

  const totalCo2 = breakdown.reduce((sum, b) => sum + b.co2Saved, 0)
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0)

  return {
    score: {
      co2Saved: Math.round(totalCo2 * 10) / 10,
      points: getPoints(totalCo2),
      rank: getRank(totalCo2),
    },
    breakdown,
    totalItemsTracked: items.length,
    totalWeightKg: Math.round(totalWeight * 10) / 10,
  }
}