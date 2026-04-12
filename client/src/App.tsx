import { useState, useEffect } from 'react'
import BarcodeScanner from './BarcodeScanner'
import './App.css'

// ─── Types ───────────────────────────────────────────────────────────────────

type ItemCategory = 'Textile' | 'Wood' | 'Metal' | 'Plastic' | 'Glass' | 'Other'
type ItemStatus = 'Active' | 'Stale' | 'Donated' | 'Recycled'

interface InventoryItem {
  id: string
  name: string
  category: ItemCategory
  weight: number
  barcode?: string
  status: ItemStatus
  riskLevel: number
  addedAt: string
  lastAccessedAt: string
  userId: string
}

interface AuthUser {
  id: string
  email: string
  businessName: string
}

// ─── API ─────────────────────────────────────────────────────────────────────

const API = 'http://localhost:3001'
const getToken = () => localStorage.getItem('token')

const apiFetch = async (path: string, options: RequestInit = {}) => {
  const token = getToken()
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || 'Request failed')
  }
  if (res.status === 204) return null
  return res.json()
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES: ItemCategory[] = ['Textile', 'Wood', 'Metal', 'Plastic', 'Glass', 'Other']

const CATEGORY_ICONS: Record<ItemCategory, string> = {
  Textile: '🧵', Wood: '🪵', Metal: '⚙️', Plastic: '♻️', Glass: '🫙', Other: '📦',
}

const STATUS_COLORS: Record<ItemStatus, string> = {
  Active: '#22c55e', Stale: '#f59e0b', Donated: '#3b82f6', Recycled: '#8b5cf6',
}

// ─── Auth Page ───────────────────────────────────────────────────────────────

function AuthPage({ onAuth }: { onAuth: (user: AuthUser, token: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError('')
    setLoading(true)
    try {
      const body = mode === 'register'
        ? { email, password, businessName }
        : { email, password }
      const data = await apiFetch(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      localStorage.setItem('token', data.token)
      onAuth(data.user, data.token)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">♻️</span>
          <h1 className="auth-title">Circular</h1>
          <p className="auth-subtitle">Inventory that cares about the planet</p>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Sign In</button>
          <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>Register</button>
        </div>

        <div className="auth-form">
          {mode === 'register' && (
            <div className="field">
              <label>Business Name</label>
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Green Workshop Co." />
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@business.com" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && submit()} />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Item Modal (with scanner) ───────────────────────────────────────────

function AddItemModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ItemCategory>('Other')
  const [weight, setWeight] = useState('')
  const [barcode, setBarcode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)

  const handleBarcodeDetected = (code: string) => {
    setBarcode(code)
    setShowScanner(false)
  }

  const submit = async () => {
    if (!name || !weight) { setError('Name and weight are required'); return }
    setError('')
    setLoading(true)
    try {
      await apiFetch('/api/items', {
        method: 'POST',
        body: JSON.stringify({
          name,
          category,
          weight: parseFloat(weight),
          barcode: barcode || undefined,
        }),
      })
      onAdded()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Show scanner fullscreen on top of this modal
  if (showScanner) {
    return (
      <BarcodeScanner
        onDetected={handleBarcodeDetected}
        onClose={() => setShowScanner(false)}
      />
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Item</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="auth-form">
          <div className="field">
            <label>Item Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Wool jacket, oak plank…" />
          </div>

          <div className="field">
            <label>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value as ItemCategory)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Weight (kg)</label>
            <input type="number" min="0" step="0.1" value={weight}
              onChange={e => setWeight(e.target.value)} placeholder="0.5" />
          </div>

          {/* Barcode field with scan button */}
          <div className="field">
            <label>Barcode <span className="optional">(optional)</span></label>
            <div className="barcode-input-row">
              <input
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                placeholder="1234567890 or scan →"
              />
              <button
                className="btn-scan"
                type="button"
                onClick={() => setShowScanner(true)}
                title="Open camera scanner"
              >
                📷
              </button>
            </div>
            {barcode && <div className="barcode-preview">🔖 {barcode}</div>}
          </div>

          {error && <div className="auth-error">{error}</div>}

          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={loading}>
              {loading ? 'Adding…' : 'Add Item'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function ItemCard({ item, onDelete, onStatusChange }: {
  item: InventoryItem
  onDelete: (id: string) => void
  onStatusChange: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await apiFetch(`/api/items/${item.id}`, { method: 'DELETE' })
      onDelete(item.id)
    } catch { setDeleting(false) }
  }

  const handleStatus = async (status: ItemStatus) => {
    setMenuOpen(false)
    try {
      await apiFetch(`/api/items/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      onStatusChange()
    } catch {}
  }

  const riskPct = Math.min(item.riskLevel * 100, 100)
  const riskColor = riskPct < 40 ? '#22c55e' : riskPct < 80 ? '#f59e0b' : '#ef4444'

  return (
    <div className={`item-card ${deleting ? 'deleting' : ''}`}>
      <div className="item-card-header">
        <span className="item-icon">{CATEGORY_ICONS[item.category]}</span>
        <div className="item-info">
          <h3 className="item-name">{item.name}</h3>
          <span className="item-category">{item.category} · {item.weight}kg</span>
        </div>
        <div className="item-actions">
          <span className="item-status" style={{ color: STATUS_COLORS[item.status] }}>
            ● {item.status}
          </span>
          <div className="item-menu-wrap">
            <button className="item-menu-btn" onClick={() => setMenuOpen(o => !o)}>⋯</button>
            {menuOpen && (
              <div className="item-menu">
                {(['Active', 'Donated', 'Recycled'] as ItemStatus[]).map(s => (
                  <button key={s} onClick={() => handleStatus(s)}>Mark as {s}</button>
                ))}
                <button className="danger" onClick={handleDelete}>Delete</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="risk-bar-wrap">
        <div className="risk-bar-label">
          <span>Waste Risk</span>
          <span style={{ color: riskColor }}>{riskPct.toFixed(0)}%</span>
        </div>
        <div className="risk-bar-track">
          <div className="risk-bar-fill" style={{ width: `${riskPct}%`, background: riskColor }} />
        </div>
      </div>

      {item.barcode && <div className="item-barcode">🔖 {item.barcode}</div>}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const fetchItems = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filterCategory) params.set('category', filterCategory)
      if (filterStatus) params.set('status', filterStatus)
      const data = await apiFetch(`/api/items?${params}`)
      setItems(data.items)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { fetchItems() }, [search, filterCategory, filterStatus])

  const handleDelete = (id: string) => setItems(prev => prev.filter(i => i.id !== id))

  const activeCount = items.filter(i => i.status === 'Active').length
  const staleCount = items.filter(i => i.status === 'Stale').length
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0)

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div className="dash-brand">
          <span>♻️</span>
          <span className="dash-brand-name">Circular</span>
        </div>
        <div className="dash-user">
          <span className="dash-business">{user.businessName}</span>
          <button className="btn-logout" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{items.length}</div>
          <div className="stat-label">Total Items</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#22c55e' }}>{activeCount}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#f59e0b' }}>{staleCount}</div>
          <div className="stat-label">At Risk</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalWeight.toFixed(1)}kg</div>
          <div className="stat-label">Total Weight</div>
        </div>
      </div>

      <div className="toolbar">
        <input className="search-input" placeholder="🔍 Search items…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
        </select>
        <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {(['Active', 'Stale', 'Donated', 'Recycled'] as ItemStatus[]).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Item</button>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <p>No items yet. Add your first one!</p>
        </div>
      ) : (
        <div className="items-grid">
          {items.map(item => (
            <ItemCard key={item.id} item={item} onDelete={handleDelete} onStatusChange={fetchItems} />
          ))}
        </div>
      )}

      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} onAdded={fetchItems} />}
    </div>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const stored = localStorage.getItem('user')
    if (token && stored) {
      try { setUser(JSON.parse(stored)) } catch {}
    }
  }, [])

  const handleAuth = (u: AuthUser, token: string) => {
    localStorage.setItem('user', JSON.stringify(u))
    localStorage.setItem('token', token)
    setUser(u)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  if (!user) return <AuthPage onAuth={handleAuth} />
  return <Dashboard user={user} onLogout={handleLogout} />
}
