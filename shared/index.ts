// 1. Categories for environmental tracking
export type ItemCategory = 'Textile' | 'Wood' | 'Metal' | 'Plastic' | 'Glass' | 'Other';

// 2. The main Inventory Item structure
export interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  weight: number;      // in kg
  barcode?: string;    // Optional: for items found via scanning
  imageUrl?: string;
  
  // Dates for Waste Logic
  addedAt: Date;
  lastAccessedAt: Date;
  
  // Predictive Logic fields
  riskLevel: number;   // 0.0 (Fresh) to 1.0+ (Stale/Waste Risk)
  status: 'Active' | 'Stale' | 'Donated' | 'Recycled';
}

// 3. Sustainability Score Interface
export interface SustainabilityScore {
  co2Saved: number;    // Calculated: Weight * Category Factor
  points: number;      // Gamification for the business
  rank: 'Bronze' | 'Silver' | 'Gold' | 'Green Titan';
}

// 4. API Request/Response Types (To keep your fetch calls safe)
export interface CreateItemRequest {
  name: string;
  category: ItemCategory;
  weight: number;
  barcode?: string;
}

export interface InventoryResponse {
  items: InventoryItem[];
  totalCount: number;
  globalSustainability: SustainabilityScore;
}