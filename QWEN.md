# QWEN.md - Catering Management System

## Project Overview

The **Catering Management System** is an enterprise-grade, full-stack platform designed to streamline corporate catering operations. It bridges employees, administrators, and canteen operators through a unified, real-time interface. The system automates meal scheduling, minimizes food waste through rigid cutoff policies, and enforces accountability via an automated no-show blacklist mechanism.

### Current Version: **2.4.1** (Released: 2026-04-09)

### Key Enterprise Features
- **Advanced Order Management**: Bulk ordering, multi-day meal planning
- **Intelligent Shift Support**: Multiple shifts with per-day break time overrides
- **Visual Identity Check-in**: QR code scanning with user photo verification
- **Guest Registry**: Temporary access QR codes and visit tracking
- **Role-Based Access Control (RBAC)**: Admin, Canteen Operator, Vendor, and User roles
- **Automated No-Show Tracking**: Auto-blacklist after 3 strikes
- **Email Communication Hub**: SMTP-based notifications and invitations
- **Real-time Dashboard**: Server-Sent Events (SSE) for live updates
- **Android Mobile App**: Capacitor-based with local notifications

---

## Tech Stack

### Backend
- **Runtime**: Node.js, Express.js (TypeScript)
- **Database**: PostgreSQL 15 with Prisma ORM
- **Cache**: Redis 7
- **Process Manager**: PM2 (Cluster Mode)
- **Authentication**: JWT with Refresh Tokens
- **Services**: Nodemailer (email), node-cron (scheduling), QR Code generation, ExcelJS (export)

### Frontend
- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS, Headless UI, Framer Motion
- **State Management**: React Context API
- **Routing**: React Router DOM v6
- **Utilities**: Axios, react-hot-toast, html5-qrcode, qrcode.react, XLSX export
- **Mobile**: Capacitor 5 (Android/iOS support)

### DevOps
- **Containerization**: Docker & Docker Compose
- **Reverse Proxy**: NGINX / Nginx Proxy Manager
- **Monitoring**: PM2 cluster mode, audit logging, SSE events

---

## Project Structure

```
Catering Management/
├── backend/                    # Node.js + Express API
│   ├── src/
│   │   ├── controllers/       # Request handlers
│   │   ├── middleware/        # Auth, rate limiting, validation
│   │   ├── routes/            # API route definitions
│   │   ├── services/          # Business logic (email, audit, cache, NTP)
│   │   ├── utils/             # Helper functions
│   │   ├── lib/               # Database client, Prisma
│   │   └── index.ts           # Entry point
│   ├── prisma/                # Database schema & migrations
│   ├── scripts/               # Database seeding, utilities
│   ├── uploads/               # User photos, check-in images
│   ├── ecosystem.config.js    # PM2 cluster configuration
│   └── Dockerfile
│
├── frontend/                  # React + Vite SPA
│   ├── src/
│   │   ├── pages/            # Page components (admin, user, canteen, vendor)
│   │   ├── components/       # Reusable UI components
│   │   ├── contexts/         # Auth, theme, SSE providers
│   │   ├── services/         # API client, notification service
│   │   ├── utils/            # Helpers, formatters
│   │   └── App.tsx           # Root component
│   ├── android/              # Capacitor Android project
│   ├── ios/                  # Capacitor iOS project
│   └── Dockerfile
│
├── nginx/                     # NGINX configuration
├── backups/                   # Database backups
├── docs/                      # Documentation & diagrams
│
├── docker-compose.npm.yml     # Docker Compose (Nginx Proxy Manager mode)
├── start-docker.bat           # Windows startup script
├── update.sh / update.ps1     # Update scripts
└── DEPLOY.md                  # Deployment guide
```

---

## Building and Running

### Prerequisites
- **Docker** & **Docker Compose** v2.0+
- **Node.js** >= 18.0 (for local development)
- **PostgreSQL** 15 (for local development)
- **Redis** 7 (for local development)

### Docker Deployment (Recommended)

```bash
# 1. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials

# 2. Start all services
docker compose -f docker-compose.npm.yml up -d --build

# 3. Verify
# Frontend: http://localhost:3011
# Backend:  http://localhost:3012/health
```

### Local Development

**Backend:**
```bash
cd backend
npm install
npx prisma generate
npm run dev              # Starts with nodemon on port 3012
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev              # Starts with vite on port 3011
```

### Database Management

```bash
# Sync schema to database
npx prisma db push

# Open Prisma Studio (GUI)
npx prisma studio

# Seed database
npx prisma db seed

# Run migrations
npx prisma migrate dev
```

### Production Build

```bash
# Backend
npm run build            # Compiles TypeScript to dist/
npm run pm2:start        # Starts PM2 cluster

# Frontend
npm run build            # Builds optimized bundle to dist/
```

---

## API Structure

### Key Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | Public | User login (returns JWT + refresh token) |
| POST | `/api/auth/refresh` | Public | Refresh access token |
| GET | `/api/orders/my-orders` | User | User's order history |
| POST | `/api/orders` | User | Create meal order |
| POST | `/api/orders/bulk` | User | Bulk multi-day orders |
| POST | `/api/orders/:id/cancel` | User/Admin | Cancel order |
| POST | `/api/orders/checkin/qr` | Canteen/Admin | QR code check-in |
| POST | `/api/orders/checkin/manual` | Canteen/Admin | Manual ID check-in |
| GET | `/api/orders/stats/dashboard` | Admin | Dashboard statistics |
| GET | `/api/orders/export` | Admin | Export to Excel |
| GET | `/api/users` | Admin | List all users |
| POST | `/api/users/import` | Admin | Import users from Excel |
| GET | `/api/server/pm2-status` | Admin | PM2 cluster info |
| POST | `/api/server/backup` | Admin | Create database backup |
| GET | `/api/sse` | User | Server-Sent Events stream |

### Authentication

The system uses **Two-Tier Security** with short-lived access tokens and long-lived refresh tokens:
- **Access Token**: JWT, short expiry (e.g., 15 minutes)
- **Refresh Token**: JWT, long expiry (e.g., 7 days), stored securely
- **Mobile**: Refresh tokens persisted via `@capacitor/preferences` for Android/iOS

---

## Database Schema

### Core Entities

- **User**: Employee records with role, department, blacklist status
- **Order**: Meal orders linked to users, shifts, and canteens
- **Shift**: Meal time slots with start/end times, cutoff rules
- **Canteen**: Pickup locations with capacity and assigned users
- **Blacklist**: No-show penalties with auto-expiry
- **Holiday**: Blocked dates (full-day or per-shift)
- **Settings**: System-wide configuration (cutoff mode, blacklist rules, SMTP, NTP)
- **Company/Division/Department**: Organizational hierarchy
- **Vendor/MenuItem/WeeklyMenu**: Menu catalog and scheduling
- **Message**: User complaints and cancellation reasons
- **Announcement**: System-wide announcements and TOS
- **AuditLog**: Comprehensive activity tracking
- **Backup**: Database backup metadata

### Order Status Flow

```
ORDERED → PICKED_UP (check-in success)
ORDERED → CANCELLED (user/admin cancels)
ORDERED → NO_SHOW (shift ended, not picked up → triggers blacklist at 3 strikes)
```

---

## Key Business Logic

### Cutoff Time Modes

1. **Per-Shift Cutoff**: `Shift Start Time - cutoffDays - cutoffHours`
2. **Weekly Cutoff**: Fixed day/time (e.g., Friday 17:00) for all subsequent week orders

### No-Show Processing (Cron: every hour at :05)

1. Finds all `ORDERED` status orders where shift ended > 5 minutes ago
2. Updates status to `NO_SHOW`, increments `user.noShowCount`
3. If `noShowCount >= blacklistStrikes` (default 3): creates blacklist entry with `endDate = now + blacklistDuration` (default 7 days)

### Check-in Process

1. Scan QR code or enter employee NIK
2. Validates order exists with `ORDERED` status
3. Checks user is not blacklisted
4. Verifies within check-in time window
5. Updates order to `PICKED_UP`, records `checkInTime`, `checkinPhoto`
6. Broadcasts SSE event for real-time dashboard update

---

## User Roles

| Role | Capabilities |
|------|-------------|
| **ADMIN** | Full system access, user management, settings, reports |
| **CANTEEN** | QR/manual check-in, real-time queue view, pickup stats |
| **VENDOR** | Menu management, vendor-specific order stats |
| **USER** | Self-service ordering, history, profile, complaints |

### Default Admin Credentials (CHANGE IMMEDIATELY)
- **Username**: `admin` or `ADMIN001`
- **Password**: `admin123`

---

## Development Conventions

### Code Style
- **TypeScript**: Strict mode enabled in both backend and frontend
- **Backend**: Express.js with controller/service/repository pattern
- **Frontend**: Functional React components with hooks, React Context for state
- **Validation**: Zod schemas for request validation on backend
- **Error Handling**: Centralized error middleware, toast notifications on frontend

### Testing Practices
- No formal test suite found in the current codebase
- Manual testing via Docker Compose staging environment
- Database schema validated via Prisma type generation

### Git Workflow
- Standard Git flow with feature branches
- Version tracking via `version.json` (auto-generated changelog)
- Changelog maintained in `CHANGELOG.md`

---

## Useful Commands

```bash
# Docker
docker compose -f docker-compose.npm.yml up -d        # Start services
docker compose -f docker-compose.npm.yml down          # Stop services
docker compose -f docker-compose.npm.yml logs -f       # View logs
docker compose -f docker-compose.npm.yml ps            # List containers

# Database
docker compose -f docker-compose.npm.yml exec db pg_dump -U postgres catering_db > backup.sql
cat backup.sql | docker compose -f docker-compose.npm.yml exec -T db psql -U postgres catering_db

# Update application
./update.sh              # Linux
.\update.ps1             # Windows

# Quick start (Windows)
quick-start.bat
```

---

## Important Notes

- **Timezone**: System uses `Asia/Jakarta` (configurable via NTP settings)
- **Currency**: Indonesian Rupiah (Rp), default meal price Rp 25,000
- **Work Days**: Monday-Saturday (configurable per department)
- **Security**: All passwords hashed with bcrypt, JWT secrets should be 32+ characters
- **Backups**: Manual and automated (via settings) database backups stored in `/backups`
- **Mobile**: Android build via Capacitor; requires Android SDK and Node.js for compilation
- **SSE**: Real-time updates require persistent HTTP connection; optimized for WebView on Android

---

## Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Project overview, quick start |
| `BLUEPRINT.md` | Comprehensive architecture & feature catalog |
| `TABLE_STRUCTURE.md` | Database schema reference |
| `DEPLOY.md` | Linux deployment guide |
| `DEPLOY-NPM.md` | Nginx Proxy Manager deployment guide |
| `NGINX_SETUP.md` | NGINX configuration guide |
| `IOS_SETUP.md` | iOS Capacitor setup guide |
| `CHANGELOG.md` | Version history |
| `backend/PM2_DEPLOYMENT.md` | PM2 cluster deployment details |
