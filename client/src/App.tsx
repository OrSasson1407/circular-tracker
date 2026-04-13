import { useState, useEffect, useRef, useCallback } from 'react'
import { ResponsiveContainer, Tooltip, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
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
  imageUrl?: string
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

interface SustainabilityBreakdown {
  category: string
  co2Saved: number
  itemCount: number
  totalWeight: number
}

interface SustainabilityResult {
  score: { co2Saved: number; points: number; rank: string }
  breakdown: SustainabilityBreakdown[]
  totalItemsTracked: number
  totalWeightKg: number
}

type ToastType = 'success' | 'error' | 'warning'
interface Toast {
  id: number
  message: string
  type: ToastType
}

// ─── API ─────────────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL ?? ''
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

// ─── Toast System ─────────────────────────────────────────────────────────────

let toastId = 0

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => onRemove(t.id)}>
          <span className="toast-icon">
            {t.type === 'success' ? '✓' : t.type === 'warning' ? '⚠' : '✕'}
          </span>
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  )
}

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const add = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return { toasts, add, remove }
}

// ─── Image Upload Helper ──────────────────────────────────────────────────────

function compressImage(file: File, maxSize = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.75))
      }
      img.onerror = reject
      img.src = e.target!.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ─── Image Upload Field ───────────────────────────────────────────────────────

function ImageUploadField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const compressed = await compressImage(file)
      onChange(compressed)
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="field">
      <label>Photo <span className="optional">(optional)</span></label>
      <div
        className={`image-drop-zone ${value ? 'has-image' : ''}`}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
      >
        {value ? (
          <>
            <img src={value} className="image-preview" alt="Item" />
            <button className="image-remove" type="button"
              onClick={e => { e.stopPropagation(); onChange('') }}>✕</button>
          </>
        ) : (
          <div className="image-placeholder">
            {uploading
              ? <span>Compressing…</span>
              : <><span className="image-upload-icon">📷</span><span>Drop image or click to upload</span></>
            }
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
    </div>
  )
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
    setError(''); setLoading(true)
    try {
      const body = mode === 'register' ? { email, password, businessName } : { email, password }
      const data = await apiFetch(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) })
      localStorage.setItem('token', data.token)
      onAuth(data.user, data.token)
    } catch (e: any) {
      setError(e.message)
    } finally { setLoading(false) }
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

// ─── Item Form Fields (shared by Add + Edit modals) ──────────────────────────

interface ItemFormProps {
  name: string; setName: (v: string) => void
  category: ItemCategory; setCategory: (v: ItemCategory) => void
  weight: string; setWeight: (v: string) => void
  barcode: string; setBarcode: (v: string) => void
  imageUrl: string; setImageUrl: (v: string) => void
  error: string; loading: boolean
  onScan: () => void
}

function ItemFormFields({ name, setName, category, setCategory, weight, setWeight, barcode, setBarcode, imageUrl, setImageUrl, error, loading, onScan }: ItemFormProps) {
  return (
    <>
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
        <input type="number" min="0" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0.5" />
      </div>
      <div className="field">
        <label>Barcode <span className="optional">(optional)</span></label>
        <div className="barcode-input-row">
          <input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="1234567890 or scan →" />
          <button className="btn-scan" type="button" onClick={onScan} title="Open camera scanner">📷</button>
        </div>
        {barcode && <div className="barcode-preview">🔖 {barcode}</div>}
      </div>
      <ImageUploadField value={imageUrl} onChange={setImageUrl} />
      {error && <div className="auth-error">{error}</div>}
      {loading && <div className="form-loading">Saving…</div>}
    </>
  )
}

// ─── Add Item Modal ───────────────────────────────────────────────────────────

function AddItemModal({ onClose, onAdded, toast }: {
  onClose: () => void; onAdded: () => void
  toast: (msg: string, type?: ToastType) => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ItemCategory>('Other')
  const [weight, setWeight] = useState('')
  const [barcode, setBarcode] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)

  const handleBarcodeDetected = (code: string) => { setBarcode(code); setShowScanner(false) }

  const submit = async () => {
    if (!name || !weight) { setError('Name and weight are required'); return }
    setError(''); setLoading(true)
    try {
      await apiFetch('/api/items', {
        method: 'POST',
        body: JSON.stringify({ name, category, weight: parseFloat(weight), barcode: barcode || undefined, imageUrl: imageUrl || undefined }),
      })
      toast(`"${name}" added to inventory`)
      onAdded(); onClose()
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  if (showScanner) return <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Item</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="auth-form">
          <ItemFormFields name={name} setName={setName} category={category} setCategory={setCategory}
            weight={weight} setWeight={setWeight} barcode={barcode} setBarcode={setBarcode}
            imageUrl={imageUrl} setImageUrl={setImageUrl} error={error} loading={loading}
            onScan={() => setShowScanner(true)} />
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={loading}>Add Item</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Item Modal ──────────────────────────────────────────────────────────

function EditItemModal({ item, onClose, onSaved, toast }: {
  item: InventoryItem; onClose: () => void; onSaved: () => void
  toast: (msg: string, type?: ToastType) => void
}) {
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState<ItemCategory>(item.category)
  const [weight, setWeight] = useState(String(item.weight))
  const [barcode, setBarcode] = useState(item.barcode ?? '')
  const [imageUrl, setImageUrl] = useState(item.imageUrl ?? '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)

  const handleBarcodeDetected = (code: string) => { setBarcode(code); setShowScanner(false) }

  const submit = async () => {
    if (!name || !weight) { setError('Name and weight are required'); return }
    setError(''); setLoading(true)
    try {
      await apiFetch(`/api/items/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, category, weight: parseFloat(weight), barcode: barcode || undefined, imageUrl: imageUrl || undefined }),
      })
      toast(`"${name}" updated`)
      onSaved(); onClose()
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  if (showScanner) return <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Item</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="auth-form">
          <ItemFormFields name={name} setName={setName} category={category} setCategory={setCategory}
            weight={weight} setWeight={setWeight} barcode={barcode} setBarcode={setBarcode}
            imageUrl={imageUrl} setImageUrl={setImageUrl} error={error} loading={loading}
            onScan={() => setShowScanner(true)} />
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={loading}>Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function ItemCard({ item, onDelete, onStatusChange, onEdit, toast }: {
  item: InventoryItem; onDelete: (id: string) => void
  onStatusChange: () => void; onEdit: (item: InventoryItem) => void
  toast: (msg: string, type?: ToastType) => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const handleDelete = async () => {
    setMenuOpen(false); setDeleting(true)
    try {
      await apiFetch(`/api/items/${item.id}`, { method: 'DELETE' })
      toast(`"${item.name}" deleted`, 'warning')
      onDelete(item.id)
    } catch { setDeleting(false) }
  }

  const handleStatus = async (status: ItemStatus) => {
    setMenuOpen(false)
    try {
      await apiFetch(`/api/items/${item.id}`, { method: 'PUT', body: JSON.stringify({ status }) })
      toast(`Marked as ${status}`)
      onStatusChange()
    } catch {}
  }

  const riskPct = Math.min(item.riskLevel * 100, 100)
  const riskColor = riskPct < 40 ? '#22c55e' : riskPct < 80 ? '#f59e0b' : '#ef4444'

  return (
    <div className={`item-card ${deleting ? 'deleting' : ''}`}>
      {item.imageUrl && (
        <div className="item-card-image">
          <img src={item.imageUrl} alt={item.name} />
        </div>
      )}
      <div className="item-card-header">
        <span className="item-icon">{CATEGORY_ICONS[item.category]}</span>
        <div className="item-info">
          <h3 className="item-name">{item.name}</h3>
          <span className="item-category">{item.category} · {item.weight}kg</span>
        </div>
        <div className="item-actions">
          <span className="item-status" style={{ color: STATUS_COLORS[item.status] }}>● {item.status}</span>
          <div className="item-menu-wrap">
            <button className="item-menu-btn" onClick={() => setMenuOpen(o => !o)}>⋯</button>
            {menuOpen && (
              <div className="item-menu">
                <button onClick={() => { setMenuOpen(false); onEdit(item) }}>✏️ Edit</button>
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

// ─── Sustainability Panel ─────────────────────────────────────────────────────

const RANK_CONFIG: Record<string, { color: string; glow: string; icon: string }> = {
  'Bronze':      { color: '#cd7f32', glow: '#cd7f3240', icon: '🥉' },
  'Silver':      { color: '#a8a9ad', glow: '#a8a9ad40', icon: '🥈' },
  'Gold':        { color: '#f59e0b', glow: '#f59e0b40', icon: '🥇' },
  'Green Titan': { color: '#34d399', glow: '#34d39940', icon: '🌍' },
}

const BAR_COLORS = ['#34d399', '#3b82f6', '#f59e0b', '#a78bfa', '#f472b6', '#fb923c']

function SustainabilityPanel({ data }: { data: SustainabilityResult }) {
  const { score, breakdown } = data
  const rank = RANK_CONFIG[score.rank] ?? RANK_CONFIG['Bronze']
  const chartData = breakdown.map((b, i) => ({ name: b.category, co2: b.co2Saved, fill: BAR_COLORS[i % BAR_COLORS.length] }))

  return (
    <div className="sustain-panel">
      <div className="sustain-header">
        <div>
          <h2 className="sustain-title">Sustainability Score</h2>
          <p className="sustain-subtitle">CO₂ avoided by keeping items in circulation</p>
        </div>
        <div className="rank-badge" style={{ borderColor: rank.color, boxShadow: `0 0 16px ${rank.glow}` }}>
          <span className="rank-icon">{rank.icon}</span>
          <div>
            <div className="rank-label">Rank</div>
            <div className="rank-name" style={{ color: rank.color }}>{score.rank}</div>
          </div>
        </div>
      </div>
      <div className="sustain-metrics">
        <div className="sustain-metric">
          <div className="sustain-metric-value" style={{ color: '#34d399' }}>
            {score.co2Saved.toLocaleString()} <span className="sustain-unit">kg CO₂</span>
          </div>
          <div className="sustain-metric-label">Total Saved</div>
        </div>
        <div className="sustain-metric">
          <div className="sustain-metric-value">{score.points.toLocaleString()}</div>
          <div className="sustain-metric-label">Points Earned</div>
        </div>
        <div className="sustain-metric">
          <div className="sustain-metric-value">{data.totalWeightKg}<span className="sustain-unit">kg</span></div>
          <div className="sustain-metric-label">Weight Tracked</div>
        </div>
      </div>
      {chartData.length > 0 && (
        <div className="sustain-chart">
          <div className="sustain-chart-label">CO₂ Saved by Category (kg)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#e6edf3' }}
                formatter={(val) => [`${Number(val)} kg CO₂`, 'Saved']}
              />
              <Bar dataKey="co2" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {breakdown.length > 0 && (
        <div className="sustain-breakdown">
          {breakdown.map((b, i) => (
            <div key={b.category} className="sustain-row">
              <div className="sustain-row-dot" style={{ background: BAR_COLORS[i % BAR_COLORS.length] }} />
              <span className="sustain-row-cat">{b.category}</span>
              <span className="sustain-row-items">{b.itemCount} items · {b.totalWeight}kg</span>
              <span className="sustain-row-co2" style={{ color: BAR_COLORS[i % BAR_COLORS.length] }}>{b.co2Saved} kg CO₂</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sustainability, setSustainability] = useState<SustainabilityResult | null>(null)
  const { toasts, add: addToast, remove: removeToast } = useToast()
  const prevStaleIds = useRef<Set<string>>(new Set())

  const fetchItems = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filterCategory) params.set('category', filterCategory)
      if (filterStatus) params.set('status', filterStatus)
      const data = await apiFetch(`/api/items?${params}`)
      const fetched: InventoryItem[] = data.items

      // Notify for newly stale items
      fetched.forEach(i => {
        if (i.status === 'Stale' && !prevStaleIds.current.has(i.id)) {
          addToast(`⚠ "${i.name}" is now at risk — consider donating`, 'warning')
        }
      })
      prevStaleIds.current = new Set(fetched.filter(i => i.status === 'Stale').map(i => i.id))

      setItems(fetched)
      setSustainability(data.globalSustainability ?? null)
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
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <header className="dash-header">
        <div className="dash-brand"><span>♻️</span><span className="dash-brand-name">Circular</span></div>
        <div className="dash-user">
          <span className="dash-business">{user.businessName}</span>
          <button className="btn-logout" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <div className="stats-row">
        <div className="stat-card"><div className="stat-value">{items.length}</div><div className="stat-label">Total Items</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: '#22c55e' }}>{activeCount}</div><div className="stat-label">Active</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: '#f59e0b' }}>{staleCount}</div><div className="stat-label">At Risk</div></div>
        <div className="stat-card"><div className="stat-value">{totalWeight.toFixed(1)}kg</div><div className="stat-label">Total Weight</div></div>
      </div>

      {sustainability && <SustainabilityPanel data={sustainability} />}

      <div className="toolbar">
        <input className="search-input" placeholder="🔍 Search items…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
        </select>
        <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {(['Active', 'Stale', 'Donated', 'Recycled'] as ItemStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Item</button>
      </div>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">📦</div><p>No items yet. Add your first one!</p></div>
      ) : (
        <div className="items-grid">
          {items.map(item => (
            <ItemCard key={item.id} item={item} onDelete={handleDelete}
              onStatusChange={fetchItems} onEdit={setEditItem} toast={addToast} />
          ))}
        </div>
      )}

      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} onAdded={fetchItems} toast={addToast} />}
      {editItem && <EditItemModal item={editItem} onClose={() => setEditItem(null)} onSaved={fetchItems} toast={addToast} />}
    </div>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const stored = localStorage.getItem('user')
    if (token && stored) { try { setUser(JSON.parse(stored)) } catch {} }
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