# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Catering Management System — employees order daily meals tied to work shifts; admins/canteen staff process QR check-ins; vendors view pickup stats. Monorepo with two independently-versioned packages:

- `backend/` — Express + TypeScript + Prisma (PostgreSQL) REST API. Version 1.8.9.
- `frontend/` — React + Vite + TypeScript SPA, wrapped as an Android/iOS app via Capacitor. Version 1.5.2.

Root `version.json` is the **app-level** version (2.5.1) surfaced in the UI/update flow — distinct from the two package versions.

## Commands

All commands run from the respective package directory.

### Backend (`backend/`)
```bash
npm run dev               # prisma generate + nodemon ts-node (hot reload, dev)
npm run build             # tsc -> dist/
npm start                 # node dist/index.js (requires build first)
npm run pm2:build-start   # build + prisma generate + PM2 cluster (production)
npm run prisma:migrate    # prisma migrate dev (apply/create migrations)
npm run prisma:seed       # ts-node prisma/seed.ts
npx prisma studio         # inspect DB
```

### Frontend (`frontend/`)
```bash
npm run dev               # vite on 0.0.0.0:3011
npm run build             # tsc && vite build
npm run lint              # eslint (ts,tsx) — max-warnings 0
npm run cap:build         # build + cap sync android
npm run cap:build:ios     # build + cap sync ios
```

There is **no test suite** in either package. "Verification" means `npm run build` (both) + `npm run lint` (frontend) + manual checks. `scripts/security-regression-test.sh` is a curl-based black-box check of security fixes (referenced as F-xxx/R-xxx in code comments), not a unit-test runner.

### Full stack (repo root)
```bash
docker compose up -d      # db (5432->3013), redis, backend (3012), frontend (3011)
```

Local defaults: seeded admin login is `admin` / `admin123`. Health check is **`GET /api/health`** (the README's `/health` is wrong).

## Critical Architecture: "Fake UTC" / Shifted-UTC time handling

This is the single most error-prone area. **Read this before touching anything date/time related.**

- `backend/src/index.ts` forces `process.env.TZ = 'UTC'` at boot. The Node process always thinks it is in UTC.
- `time.service.ts` `getNow()` takes real UTC and **adds the configured timezone offset** (default Asia/Jakarta UTC+7), producing a `Date` whose UTC fields hold local wall-clock values. This is "Fake UTC" / "Shifted UTC".
- `getNowUTC()` is an **alias of `getNow()`** (not real UTC) — intentionally, so DB writes store shifted time.
- Prisma serializes these as ISO with a `Z` suffix. The frontend (`frontend/src/utils/timezone.ts` `formatToWIB`) **strips the `Z`** and parses as local, displaying the wall-clock value without re-converting.
- Business dates (orderDate, holidays) use `parseDateToCateringTime("YYYY-MM-DD")` → `Date.UTC(...)` midnight, so a calendar date is always that UTC midnight regardless of server TZ.

Consequences:
- Never call `new Date()` directly for business logic — use `getNow()` / `getToday()` / `getTomorrow()` / `getTimeToday()` from `time.service.ts`.
- Never "convert timezones" on the frontend for backend timestamps — the value is already wall-clock. Use the `formatToWIB`/`*WIB` helpers.
- NTP sync (`initNTPService`) adjusts a `cachedOffset` on top of this; timezone is configurable in Settings, so don't hardcode Jakarta.

## Audit-remediation helpers (added 2026-06-13)

The 5-agent audit on 2026-06-13 surfaced 140 findings; waves 0-4 of the remediation plan added these cross-cutting helpers. **Use them — do not re-invent the same logic in a route handler.**

- **`backend/src/utils/orderDate.ts`** — Fake-UTC date helpers.
  - `parseOrderDate("2026-02-20")` — parse YYYY-MM-DD to Fake-UTC midnight. Use this anywhere a business date comes in via query/body. Returns `null` on invalid input.
  - `toOrderDateKey(d)` / `toOrderDateKeyFromPrisma(d)` — extract the YYYY-MM-DD catering calendar key from any ISO string or Prisma Date.
  - `safeDateFromBody(s)` — tolerant date parser for non-business timestamps (e.g. `?from=...`); returns `null` on invalid.
  - `isSameCateringDay(a, b)` / `addDaysToKey(key, n)` — calendar math without DST/tz slips.
- **`backend/src/middleware/blockVendor.middleware.ts`** — `blockVendorMiddleware` rejects VENDOR role with 403. Use this on every order/checkin mutation route; the inline `if (role === 'VENDOR')` checks are gone.
- **`backend/src/services/order.service.ts` `createOrderWithCapacityCheck` + `CapacityError`** — capacity check + create in a SERIALIZABLE transaction. Use this on every order-create path. Catch `CapacityError` → 409 `CAPACITY_FULL`.
- **`backend/src/services/cache.service.ts` `getCachedSettings()`** — single source of truth for the `Settings` row, Redis-cached 30 min. **Do not call `prisma.settings.findUnique/findFirst` outside `settings.routes.ts`**.
- **`backend/src/utils/env.ts` `ENABLE_TOKEN_ROTATION`** — feature flag for F-3 (refresh-token rotation). Also flip via `Settings.enableTokenRotation` in the admin UI.
- **`frontend/src/utils/dateHelpers.ts`** — `getLocalDateString()`, `addDays()`, `formatOrderDateTime()`, `formatOrderDate()`, `formatOrderTime()`. Replaces `new Date().toISOString().split('T')[0]` and `Date.now() + 86400000`.
- **`frontend/src/utils/timezone.ts:formatToWIB`** — TZ-neutral substring slicer. The previous `toLocaleString` re-converted Fake-UTC values for non-WIB viewers; this is now safe for all timezones.

## Backend structure

- Entry `src/index.ts`: registers all `/api/*` routers, CORS (`credentials: true`), compression, cookie-parser, static `/uploads`, centralized `errorHandler` (last), graceful shutdown, and on-listen init of Redis, cache, NTP, scheduler, token cleanup.
- Routes under `src/routes/`, one file per domain. **Orders are special**: split into `src/routes/order/` modules (`list`, `create`, `bulk`, `checkin`, `cancel`, `admin`) combined in `order/index.ts`. All those modules import shared deps from `order/shared.ts` (re-exports prisma, middleware, time helpers, services). There is also a legacy `order.routes.ts` mounted on the same `/api/orders` path for stats/export only — both are mounted, order matters.
- `src/services/` holds cross-cutting logic: `time.service`, `redis.service`, `cache.service` (Redis-backed, e.g. `getCachedSettings`), `audit.service` (`logOrder`, `getRequestContext`), `scheduler` (node-cron no-show processing), `notification.service` (hybrid Web Push + FCM), `rate-limiter.service`.
- Singleton Prisma client: always import from `src/lib/prisma.ts`.

### Auth & roles
- JWT bearer access token + refresh token (HttpOnly cookie on web, `@capacitor/preferences` body on native). Refresh tokens hashed (SHA-256) in DB, revocable.
- `auth.middleware.ts`: `authMiddleware` verifies JWT then **chains into `passwordChangeGuard`** — if a user has `mustChangePassword`, all endpoints except a small whitelist (change-password, logout, me, refresh, sse/ticket, health) return 403 `MUST_CHANGE_PASSWORD`. The guard caches the flag in Redis (60s TTL).
- Role guards: `adminMiddleware`, `canteenMiddleware` (CANTEEN or ADMIN), `vendorMiddleware` (VENDOR or ADMIN). Roles: `USER | ADMIN | CANTEEN | VENDOR`.
- **VENDOR is restricted**: explicitly blocked from creating orders (checked in `order/create.ts` and bulk, plus middleware) and confined to vendor pages. When adding order-mutating endpoints, replicate the VENDOR block.

### Ordering domain rules
- Cutoff has two modes (`Settings.cutoffMode`): `per-shift` (X days + Y hours before shift start) and `weekly` (cutoff day/hour + orderable weekday CSV + weeks ahead). Enforced via `cutoffMiddleware` and `isPastCutoffForDate` / `isDateOrderableWeekly`.
- Blacklist (`blacklistMiddleware`) blocks ordering for users with active blacklist; no-shows accumulate `noShowCount` and auto-blacklist after configurable strikes.
- Each order has a unique `qrCode`; check-in flips `ORDERED` → `PICKED_UP` (race-protected against double-scan). Optional check-in photo (sharp-resized).
- Holidays/Sundays can block ordering per-shift or full-day.

## Frontend structure

- `src/App.tsx` is the router + role gating. `ProtectedRoute` enforces `roles`, redirects VENDOR to `/vendor`, and renders `ForcePasswordChange` when `mustChangePassword`. Admin pages are `React.lazy` code-split; user/login pages are eager.
- `src/contexts/AuthContext.tsx` owns the axios instance (`api`), the request interceptor (attaches in-memory token), and the **response interceptor that auto-refreshes on 401** with a queued-retry pattern, dispatching a `force-logout` window event on refresh failure. Import `api` from here for all backend calls.
- `SSEContext` provides server-sent-events live updates (orders, notifications) — backend SSE uses a short-lived ticket (`POST /api/sse/ticket`) since EventSource can't send Authorization headers.
- Capacitor: native push (FCM), local notifications scheduled up to 7 days ahead for order reminders. `VITE_API_URL` empty = same-origin (web); set for native builds (`.env.capacitor`).

## Conventions

- User-facing strings and many comments are in **Indonesian** (Bahasa). Match the surrounding language when editing UI text or error messages (`utils/errorMessages.ts`).
- Many models carry **denormalized display fields** (e.g. `Order.checkedInBy` name alongside `checkedInById`, `User.company/division/department` legacy strings alongside `departmentId`). Keep both in sync on writes.
- Prisma schema has extensive composite indexes tuned for dashboard queries — preserve them when adding fields/migrations.
- Security-sensitive code references audit IDs (`R-001`, `F-006`, etc.) in comments tied to `scripts/security-regression-test.sh`. Don't remove these without understanding the regression they guard.
- Production runs behind Nginx Proxy Manager; **security headers (HSTS/CSP/X-Frame-Options) are set at the proxy layer, not in Express** — do not add them in `index.ts` (causes duplicate-header regressions).
- **`README.md` is inflated marketing — do not trust it for the stack.** It claims Helmet, Framer Motion, Headless UI, XLSX, and a "Guest Registry" module, none of which exist (no `helmet`, headers are proxy-side; Excel is `exceljs`; there is no Guest model). Verify against `package.json` / `schema.prisma`, not the README.
