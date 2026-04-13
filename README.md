🌍 Circular Tracker

Circular Tracker is a full-stack, mobile-first inventory management platform that helps small businesses reduce waste and track their environmental footprint.

It combines real-time barcode scanning, predictive analytics, and CO₂ impact tracking to transform how materials like textiles, metals, and plastics are managed.

✨ Key Features
📦 Smart Inventory Management – Track and manage items with full CRUD functionality
📷 Real-Time Barcode Scanning – Instantly identify items using device camera
🧠 Predictive Waste Detection – Flag stagnant inventory before it becomes waste
🌱 Sustainability Scoring – Measure CO₂ savings and environmental impact
📊 Interactive Analytics Dashboard – Visualize waste reduction and trends
🔐 Secure Authentication – JWT-based auth with encrypted passwords
🛠 Tech Stack
Frontend (Client)
Framework: React 19 + Vite + TypeScript
Styling: Tailwind CSS + Shadcn/ui
State Management: TanStack Query (React Query)
Barcode Scanning: @zxing/library
Data Visualization: Recharts
Backend (Server)
Runtime: Node.js + TypeScript
Framework: Fastify
Database: PostgreSQL + Prisma ORM
Authentication: JWT (7-day expiry) + bcrypt
📂 Project Structure
/circular-tracker
├── client/             # React + Vite dashboard
├── server/             # Fastify API + business logic
├── shared/             # Shared TypeScript types
├── .env                # Environment variables
├── docker-compose.yml  # Postgres + server setup
└── README.md
⚙️ Core Architecture
🔎 Scanning Engine
Uses device camera to scan barcodes in real time
Matches items against:
Local database
External APIs (e.g. OpenFoodFacts)
Unknown items can be manually added
🧠 Predictive Waste Logic

The system evaluates inventory risk using:

Risk = (CurrentDate - LastAccessedDate) / Threshold
Items with Risk ≥ 1.0 are flagged as Stale
Suggested actions:
Donate
Reuse
Recycle
🌱 Sustainability Score

Tracks environmental impact based on:

Item category (textile, metal, plastic, etc.)
Item weight

Outputs:

Estimated CO₂ saved
User progression (e.g. Bronze → Green Titan)
🚀 Getting Started
Prerequisites
Node.js 20+
PostgreSQL 15+ (or Docker)
1. Install Dependencies
npm install
2. Configure Environment

Create server/.env:

DATABASE_URL=postgresql://user:password@localhost:5432/circular
JWT_SECRET=your-secret-here
3. Initialize Database
cd server
npx prisma db push
4. Run Development Servers
npm run dev
Client → http://localhost:5173
Server → http://localhost:3001
🐳 Docker Setup (Optional)

Run PostgreSQL and server with:

docker-compose up --build
🗺 Roadmap
Phase 1 – Foundation
Shared types setup
Prisma schema + DB
Authentication system
Phase 2 – Inventory Core
Full CRUD API
Inventory dashboard UI
Category filtering
Phase 3 – Smart Features
Barcode scanner
Waste risk engine
CO₂ analytics dashboard
Phase 4 – Production
PWA support
Deployment (Vercel + Railway)
Performance optimizations
📈 Future Improvements
AI-based waste prediction
Multi-user team collaboration
IoT integrations (smart bins, sensors)
Advanced sustainability reporting
🤝 Contributing

Contributions are welcome!
Feel free to open issues or submit pull requests.

📄 License

This project is licensed under the MIT License.

💡 Vision

Circular Tracker aims to empower businesses to transition toward a circular economy, where waste is minimized and resources are continuously reused.