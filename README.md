# Circular Tracker

A sustainability-focused inventory tracker for small businesses — track textiles, metals, plastics and more, monitor waste risk, and measure your CO₂ impact.

---

## Stack

| Layer    | Tech                                      |
|----------|-------------------------------------------|
| Frontend | React + TypeScript + Vite                 |
| Backend  | Fastify + TypeScript                      |
| Database | PostgreSQL via Prisma 7                   |
| Auth     | JWT (7-day tokens, bcrypt passwords)      |
| Deploy   | Docker Compose / Vercel + Railway         |

---

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or Docker)

---

## Environment Variables

Create `server/.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/circular
JWT_SECRET=your-secret-here-min-32-chars
```

Create `client/.env` (optional, defaults to relative `/`):

```env
VITE_API_URL=http://localhost:3001
```

---

## Running Locally

### 1. Install dependencies

```bash
npm install          # installs root + workspace packages
```

### 2. Set up the database

```bash
cd server
npx prisma db push   # creates tables from schema
```

### 3. Start the server

```bash
cd server
npm run dev          # tsx watch on port 3001
```

### 4. Start the client

```bash
cd client
npm run dev          # Vite on port 5173
```

Open [http://localhost:5173](http://localhost:5173).

---

## Running with Docker

```bash
docker compose up --build
```

- Client: [http://localhost:80](http://localhost:80)
- Server: [http://localhost:3001](http://localhost:3001)

---

## Deploying

### Vercel (frontend)

1. Connect the repo to Vercel
2. Set **Root Directory** to `client`
3. Add env var: `VITE_API_URL=https://your-api.railway.app`

### Railway (backend)

1. Create a new Railway service pointing to `/server`
2. Add a PostgreSQL plugin
3. Set env vars: `DATABASE_URL` (auto-filled by Railway plugin), `JWT_SECRET`
4. On first deploy run: `npx prisma db push`

---

## API Overview

| Method | Path                         | Auth | Description                    |
|--------|------------------------------|------|--------------------------------|
| POST   | /auth/register               | —    | Create account (10/hr limit)   |
| POST   | /auth/login                  | —    | Sign in (20/15min limit)       |
| POST   | /auth/change-password        | ✓    | Change password                |
| GET    | /api/items                   | ✓    | List items (filter/search)     |
| POST   | /api/items                   | ✓    | Create item                    |
| PUT    | /api/items/:id               | ✓    | Update item                    |
| DELETE | /api/items/:id               | ✓    | Delete item                    |
| GET    | /api/items/:id/history       | ✓    | Activity log for an item       |
| GET    | /api/barcode/:code           | ✓    | OpenFoodFacts product lookup   |
| GET    | /api/sustainability          | ✓    | Sustainability score           |

---

## Key Features

- **Barcode scanning** — camera scan auto-fills name + category via OpenFoodFacts
- **Waste risk scoring** — server-side logic flags stale items automatically each night
- **Sustainability score** — CO₂ saved, points, and Bronze → Green Titan rank
- **Sort & filter** — by date added, risk level, name, or weight
- **Bulk actions** — select multiple items to mark donated/recycled or delete
- **CSV export** — one-click download of full inventory
- **Activity history** — per-item audit log (added, edited, status changed)
- **Password change** — users can update their password from the dashboard
- **JWT expiry handling** — expired tokens auto-logout and redirect to login
- **Rate limiting** — brute-force protection on auth endpoints
