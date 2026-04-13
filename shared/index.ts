// 1. Categories for environmental tracking
export type ItemCategory = 'Textile' | 'Wood' | 'Metal' | 'Plastic' | 'Glass' | 'Other';

// 2. The main Inventory Item structure
export interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  weight: number;
  barcode?: string;
  imageUrl?: string;
  addedAt: Date;
  lastAccessedAt: Date;
  riskLevel: number;
  status: 'Active' | 'Stale' | 'Donated' | 'Recycled';
  userId: string;
}

// 3. Sustainability Score Interface
export interface SustainabilityScore {
  co2Saved: number;
  points: number;
  rank: 'Bronze' | 'Silver' | 'Gold' | 'Green Titan';
}

export interface SustainabilityBreakdown {
  category: string;
  co2Saved: number;
  itemCount: number;
  totalWeight: number;
}

export interface SustainabilityResult {
  score: SustainabilityScore;
  breakdown: SustainabilityBreakdown[];
  totalItemsTracked: number;
  totalWeightKg: number;
}

// 4. Auth types
export interface RegisterRequest {
  email: string;
  password: string;
  businessName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    businessName: string;
  };
}

// 5. Item Request/Response Types
export interface CreateItemRequest {
  name: string;
  category: ItemCategory;
  weight: number;
  barcode?: string;
  imageUrl?: string;
}

export interface UpdateItemRequest {
  name?: string;
  category?: ItemCategory;
  weight?: number;
  barcode?: string;
  imageUrl?: string;
  status?: 'Active' | 'Stale' | 'Donated' | 'Recycled';
}

export interface InventoryResponse {
  items: InventoryItem[];
  totalCount: number;
  globalSustainability: SustainabilityResult;
}