# Performance Improvement Spec & Plan
## Catering Management System — 5000 User/Hari Target

**Server**: 4 Core, 8GB RAM, Ubuntu, Docker Containers  
**Date**: 2026-07-14  
**Status**: DRAFT v2 — Verified Against Codebase

---

## Daftar Isi

1. [Executive Summary](#1-executive-summary)
2. [Tier 1: Config-Only Fixes](#2-tier-1-config-only-fixes)
3. [Tier 2: Code Changes — HIGH Impact](#3-tier-2-code-changes--high-impact)
4. [Tier 3: Code Changes — MEDIUM Impact](#4-tier-3-code-changes--medium-impact)
5. [Tier 4: Code Changes — LOW Impact](#5-tier-4-code-changes--low-impact)
6. [Dependency Graph](#6-dependency-graph)
7. [Resource Budget](#7-resource-budget)
8. [Testing Strategy](#8-testing-strategy)
9. [Rollback Plans](#9-rollback-plans)
10. [Timeline & Effort Estimation](#10-timeline--effort-estimation)

---

## 1. Executive Summary

### Masalah Utama

Aplikasi catering management **tidak bisa production-ready** di 4-core/8GB tanpa perbaikan. 3 masalah bersifat **crash/blocker**:

1. DB connection pool (200) > PostgreSQL max_connections (100) → crash on startup
2. Redis tanpa memory limit → OOM kill
3. SSE tidak cluster-aware → bug fungsional (event hilang antar worker)

### Skala Perbaikan

| Tier | Jumlah Items | Effort | Impact | Code Change? |
|------|-------------|--------|--------|--------------|
| Tier 1: Config-Only | 6 | 1-2 jam | Fix crash/OOM | Tidak |
| Tier 2: HIGH Code | 4 | 1-2 hari | Production ready | Ya |
| Tier 3: MEDIUM Code | 6 | 2-3 hari | Stability + headroom | Ya |
| Tier 4: LOW Code | 3 | 1 hari | Nice to have | Ya |
| **TOTAL** | **19** | **5-7 hari** | **5000 user/hari** | |

### Verdict

- **Config-only**: Dari "crash" → "bisa jalan, ~500 concurrent"
- **Config + Tier 2**: "Production ready, ~200-500 peak concurrent"
- **Config + All Tiers**: "Robust, headroom untuk pertumbuhan"

---

## 2. Tier 1: Config-Only Fixes

### FIX-C1: PostgreSQL Tuning

**File**: `docker-compose.yml` (line 26, service `db`)  
**Risk**: LOW — standard PostgreSQL tuning, well-documented params  
**Rollback**: Hapus `command:` block, kembali ke defaults

**Current**:
```yaml
db:
  image: postgres:15-alpine
  # No command override → stock defaults
  # shared_buffers=128MB, max_connections=100, work_mem=4MB
```

**Target**:
```yaml
db:
  image: postgres:15-alpine
  container_name: catering-db
  restart: unless-stopped
  ports:
    - "3013:5432"
  environment:
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: ${DB_PASSWORD:-your_secure_password_here}
    POSTGRES_DB: catering_db
  command: >
    postgres
    -c shared_buffers=256MB
    -c effective_cache_size=768MB
    -c work_mem=16MB
    -c maintenance_work_mem=128MB
    -c wal_buffers=16MB
    -c checkpoint_completion_target=0.9
    -c max_wal_size=2GB
    -c min_wal_size=512MB
    -c random_page_cost=1.1
    -c effective_io_concurrency=200
    -c max_connections=200
    -c statement_timeout=30000
  volumes:
    - postgres_data:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres"]
    interval: 5s
    timeout: 5s
    retries: 5
  deploy:
    resources:
      limits:
        memory: 1G
        cpus: '2.0'
      reservations:
        memory: 512M
  networks:
    - catering-network
```

**Parameter Explanation**:

| Parameter | Default | New | Why |
|-----------|---------|-----|-----|
| `shared_buffers` | 128MB | 256MB | 25% of 8GB RAM. PG's own buffer cache |
| `effective_cache_size` | 4GB | 768MB | Tells planner about available OS cache |
| `work_mem` | 4MB | 16MB | Faster sorts/joins for dashboard queries |
| `maintenance_work_mem` | 64MB | 128MB | Faster VACUUM, CREATE INDEX |
| `wal_buffers` | ~4MB | 16MB | Reduces WAL write contention |
| `max_connections` | 100 | 200 | Must be ≥ PM2_workers × DB_POOL_SIZE |
| `statement_timeout` | 0 (unlimited) | 30000 | Kill runaway queries after 30s |
| `random_page_cost` | 4.0 | 1.1 | Assumes SSD storage |
| `effective_io_concurrency` | 1 | 200 | SSD can handle parallel I/O |

**Impact**: Query kompleks 30-50% lebih cepat. `max_connections=200` mencegah crash.

**Verification**:
```sql
-- After restart, verify in psql:
SHOW shared_buffers;        -- Should be 256MB
SHOW max_connections;        -- Should be 200
SHOW work_mem;               -- Should be 16MB
SELECT count(*) FROM pg_stat_activity;  -- Monitor connections
```

---

### FIX-C2: Redis Memory Limit

**File**: `docker-compose.yml` (line 88, service `redis`)  
**Risk**: LOW — standard Redis config  
**Rollback**: Hapus `command:` override

**Current**:
```yaml
redis:
  image: redis:7-alpine
  command: redis-server --appendonly yes --appendfilename "appendonly.aof"
```

**Target**:
```yaml
redis:
  image: redis:7-alpine
  container_name: catering-redis
  restart: unless-stopped
  expose:
    - "6379"
  command: >
    redis-server
    --appendonly yes
    --appendfilename "appendonly.aof"
    --maxmemory 200mb
    --maxmemory-policy allkeys-lru
    --save ""
    --tcp-backlog 511
    --hz 10
  volumes:
    - redis_data:/data
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 5s
    timeout: 3s
    retries: 5
  deploy:
    resources:
      limits:
        memory: 256M
  networks:
    - catering-network
```

**Parameter Explanation**:

| Parameter | Default | New | Why |
|-----------|---------|-----|-----|
| `maxmemory` | unlimited | 200mb | Prevent OOM kill of container |
| `maxmemory-policy` | noeviction | allkeys-lru | Evict least-recently-used keys when full |
| `save` | "3600 1 300 100 60 10000" | "" | Disable RDB snapshots (AOF already on). Prevents fork latency spikes |
| `tcp-backlog` | 511 | 511 | Explicit (already default, but documents intent) |
| `hz` | 10 | 10 | Explicit (default is fine) |

**Impact**: Mencegah OOM. Eliminasi RDB fork latency spikes. LRU eviction menjaga cache tetap relevan.

**Verification**:
```bash
docker exec catering-redis redis-cli INFO memory
# maxmemory: 209715200 (200MB)
# maxmemory_policy: allkeys-lru

docker exec catering-redis redis-cli CONFIG GET maxmemory
# Should return 209715200
```

---

### FIX-C3: Backend Environment Variables

**File**: `docker-compose.yml` (line 38, service `backend.environment`)  
**Risk**: LOW — env var changes only  
**Rollback**: Kembalikan ke nilai lama

**Current**:
```yaml
environment:
  NODE_ENV: production
  PORT: 3012
  DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@db:5432/catering_db?schema=public
  DB_POOL_SIZE: "50"
  JWT_SECRET: ${JWT_SECRET}
  JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
  CORS_ORIGIN: ${CORS_ORIGIN:-*}
```

**Target**:
```yaml
environment:
  NODE_ENV: production
  PORT: 3012
  DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@db:5432/catering_db?schema=public
  DB_POOL_SIZE: "20"
  PM2_INSTANCES: "2"
  UV_THREADPOOL_SIZE: "16"
  REDIS_URL: redis://catering-redis:6379
  JWT_SECRET: ${JWT_SECRET}
  JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
  CORS_ORIGIN: ${CORS_ORIGIN:-*}
```

**Changes**:

| Variable | Old | New | Why |
|----------|-----|-----|-----|
| `DB_POOL_SIZE` | 50 | 20 | 2 workers × 20 = 40 connections. Aman untuk PG max_connections=200 |
| `PM2_INSTANCES` | not set (='max'=4) | 2 | 2 workers lebih stabil di 8GB. 4 workers terlalu ketat |
| `UV_THREADPOOL_SIZE` | 4 (default) | 16 | Lebih banyak I/O threads untuk Prisma, Sharp, QR generation |
| `REDIS_URL` | not set (hardcoded fallback) | redis://catering-redis:6379 | Explicit, mencegah DNS edge cases |

**Memory Math**:
```
2 workers × 768MB heap = 1.5GB (dengan FIX-C4)
PG: 1GB (dengan FIX-C1)
Redis: 256MB (dengan FIX-C2)
Frontend: 128MB
OS: 1GB
Docker overhead: 300MB
────────────────────────
TOTAL: ~4.2GB / 8GB = 3.8GB headroom ✅
```

---

### FIX-C4: PM2 Configuration

**File**: `backend/ecosystem.config.js` (line 30-67)  
**Risk**: LOW — PM2 config changes  
**Rollback**: Kembalikan ke file lama

**Current**:
```javascript
module.exports = {
    apps: [{
        name: 'catering-backend',
        script: 'dist/index.js',
        instances: process.env.PM2_INSTANCES || 'max',
        exec_mode: 'cluster',
        max_memory_restart: '1G',
        watch: false,
        autorestart: true,
        restart_delay: 1000,
        max_restarts: 10,
        env: {
            NODE_ENV: 'production',
            PORT: 3012,
            TZ: 'Asia/Jakarta'
        },
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        merge_logs: true,
        kill_timeout: 5000,
        listen_timeout: 10000,
        instance_var: 'INSTANCE_ID',
    }]
};
```

**Target**:
```javascript
module.exports = {
    apps: [{
        name: 'catering-backend',
        script: 'dist/index.js',
        instances: process.env.PM2_INSTANCES || '2',
        exec_mode: 'cluster',

        // V8 heap tuning — cap at 768MB per worker
        node_args: '--max-old-space-size=768 --max-semi-space-size=64',

        max_memory_restart: '1G',
        watch: false,

        // Auto-restart with exponential backoff
        autorestart: true,
        exp_backoff_restart_delay: 100,
        max_restarts: 10,

        env: {
            NODE_ENV: 'production',
            PORT: 3012,
            TZ: 'Asia/Jakarta'
        },

        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        merge_logs: true,

        kill_timeout: 5000,
        listen_timeout: 10000,
        instance_var: 'INSTANCE_ID',
    }]
};
```

**Changes**:

| Setting | Old | New | Why |
|---------|-----|-----|-----|
| `instances` | `'max'` (=4 cores) | `process.env.PM2_INSTANCES \|\| '2'` | 2 workers lebih stabil. Overridable via env var |
| `node_args` | not set | `--max-old-space-size=768 --max-semi-space-size=64` | Cap heap di 768MB. Larger young-gen = less minor GC |
| `restart_delay` | `1000` (flat 1s) | removed | Diganti oleh exp_backoff |
| `exp_backoff_restart_delay` | not set | `100` | 100ms → 200ms → 400ms → ... → 15s. Prevents restart storms |

**NOTE**: PM2 reads env var `PM2_INSTANCES` (set in docker-compose `environment`). The `instance_var: 'INSTANCE_ID'` sets `process.env.INSTANCE_ID` per worker for scheduler dedup — this is separate and should be preserved.

**Impact**: Mencegah container OOM. Restart lebih cepat saat dependency down.

---

### FIX-C5: Frontend Nginx Tuning

**File**: `frontend/nginx.conf` (lines 1-32)  
**Risk**: LOW — nginx config changes  
**Rollback**: Kembalikan ke file lama

**Current**:
```nginx
server {
    listen 3011;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml application/javascript;
    gzip_disable "MSIE [1-6]\.";

    location ~* \.(?:css|js|jpg|jpeg|gif|png|ico|cur|gz|svg|svgz|mp4|ogg|ogv|webm|htc)$ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    location ~* \.(?:manifest|appcache|html?|xml|json)$ {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Target**:
```nginx
server {
    listen 3011;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Kernel-level file serving optimization
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;

    # File descriptor cache
    open_file_cache max=1000 inactive=20s;
    open_file_cache_valid 30s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    # Gzip compression — improved
    gzip on;
    gzip_vary on;
    gzip_min_length 256;
    gzip_comp_level 6;
    gzip_proxied any;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/json
        application/manifest+json
        application/xml
        application/x-javascript
        image/svg+xml;
    gzip_disable "MSIE [1-6]\.";

    # Static assets — immutable (Vite hashed filenames)
    location ~* \.(?:css|js|jpg|jpeg|gif|png|ico|cur|gz|svg|svgz|mp4|ogg|ogv|webm|htc)$ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    # No-cache for HTML/JSON
    location ~* \.(?:manifest|appcache|html?|xml|json)$ {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Changes**:

| Setting | Old | New | Impact |
|---------|-----|-----|--------|
| `gzip_min_length` | 10240 (10KB) | 256 | Compress API JSON responses (most < 10KB) |
| `gzip_comp_level` | 1 (default) | 6 | 80% of max compression at 30% CPU |
| `gzip_proxied` | expired no-cache no-store private auth | any | Compress all proxied responses |
| `gzip_types` | missing `application/json` | added | API responses get compressed |
| `sendfile` | off (default) | on | Kernel-level file serving |
| `tcp_nopush` | off | on | Optimize packet framing with sendfile |
| `open_file_cache` | off | max=1000 inactive=20s | Cache file descriptors |

**Impact**: API responses 20-40% lebih kecil. Static asset serving lebih cepat.

---

### FIX-C6: Reverse Proxy Nginx Tuning

**File**: `nginx/nginx.conf` (lines 1-75)  
**Risk**: LOW  
**Rollback**: Kembalikan ke file lama

**Changes** — tambah `keepalive` di upstream blocks:

```nginx
upstream frontend {
    server frontend:3011;
    keepalive 32;
}

upstream backend {
    server backend:3012;
    keepalive 64;
}
```

Dan di location blocks yang bukan WebSocket, ganti:
```nginx
# Untuk /uploads/ dan /health (bukan WebSocket):
proxy_http_version 1.1;
proxy_set_header Connection "";
```

**Impact**: Eliminasi TCP connection overhead. Keepalive reuse koneksi yang sudah ada.

---

## 3. Tier 2: Code Changes — HIGH Impact

### FIX-H1: SSE Cluster Awareness (Redis Pub/Sub)

**File**: `backend/src/controllers/sse.controller.ts` (274 lines)  
**Risk**: MEDIUM — architectural change to SSE system  
**Rollback**: Revert to in-memory-only SSE  
**Dependencies**: None (independent)

**Problem**:
```
PM2 Worker 1: clients Map = {user-A, user-B}
PM2 Worker 2: clients Map = {user-C, user-D}

Worker 1 broadcasts "order:created" → user-A, user-B receive
Worker 2's clients (user-C, user-D) NEVER receive the event
```

**Current State (verified)**:
- Heartbeat ALREADY EXISTS in `sse.routes.ts` (line 86-97): `setInterval` at 10s, sends `event: heartbeat` with `time`, `clientId`, `tabId`
- Cleanup ALREADY EXISTS: `req.on('close')` and `req.on('error')` both clear interval + remove client (lines 100-108)
- Ticket-based auth: `POST /ticket` (30s JWT expiry), `GET /` with `?ticket=&tabId=`
- `addClient()` returns `void` (not boolean) — SSE routes don't check return value

**Spec**:

1. Add Redis pub/sub to SSEManager for cross-worker event relay
2. `broadcast()` → publish to Redis channel `sse:broadcast` instead of direct write
3. `broadcastToUser()` → publish to `sse:user:{userId}`
4. `broadcastToRoles()` → publish to `sse:roles:{role}`
5. Each worker subscribes and forwards to local clients only
6. Add connection cap: max 1000 total, max 5 per user
7. Change heartbeat from 10s to 30s (reduces writes from 500/s to 167/s at 5000 clients)
8. Add idle timeout: close connections with no activity in 5 minutes

**Implementation Sketch**:

```typescript
// sse.controller.ts — changes to existing SSEManager class

import { createClient, RedisClientType } from 'redis';

class SSEManager {
    private clients: Map<string, SSEClient> = new Map();
    private eventHistory: EventLog[] = [];
    private maxHistorySize = 100;

    // NEW: Redis pub/sub for cluster awareness
    private pubClient: RedisClientType | null = null;
    private subClient: RedisClientType | null = null;
    private readonly MAX_CLIENTS = 1000;
    private readonly MAX_CLIENTS_PER_USER = 5;
    private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000;

    // NEW: Initialize Redis pub/sub — call once at startup
    async initPubSub(): Promise<void> {
        const redisUrl = process.env.REDIS_URL || 'redis://catering-redis:6379';

        this.pubClient = createClient({ url: redisUrl });
        this.subClient = this.pubClient.duplicate();

        await this.pubClient.connect();
        await this.subClient.connect();

        await this.subClient.subscribe('sse:broadcast', (message) => {
            const { event, data } = JSON.parse(message);
            this.writeToLocalClients(event, data, null);
        });

        await this.subClient.pSubscribe('sse:user:*', (message, channel) => {
            const userId = channel.replace('sse:user:', '');
            const { event, data } = JSON.parse(message);
            this.writeToLocalClients(event, data, { userId });
        });

        await this.subClient.pSubscribe('sse:roles:*', (message, channel) => {
            const role = channel.replace('sse:roles:', '');
            const { event, data } = JSON.parse(message);
            this.writeToLocalClients(event, data, { role });
        });

        console.log('[SSE] Redis pub/sub initialized for cluster awareness');
    }

    // MODIFIED: publish to Redis instead of direct write
    broadcast(event: string, data: any): void {
        const enrichedData = {
            ...data,
            _sse: { event, broadcastTime: getNow().toISOString(), clientCount: this.clients.size }
        };
        this.logEvent(event, enrichedData);

        if (this.pubClient?.isReady) {
            this.pubClient.publish('sse:broadcast', JSON.stringify({ event, data: enrichedData }));
        } else {
            // Fallback: direct write (single-process mode)
            this.writeToLocalClients(event, enrichedData, null);
        }
    }

    // MODIFIED: publish to Redis for user-specific
    broadcastToUser(userId: string, event: string, data: any): void {
        const enrichedData = {
            ...data,
            _sse: { event, targetUser: userId, broadcastTime: getNow().toISOString() }
        };
        if (this.pubClient?.isReady) {
            this.pubClient.publish(`sse:user:${userId}`, JSON.stringify({ event, data: enrichedData }));
        } else {
            this.writeToLocalClients(event, enrichedData, { userId });
        }
    }

    // MODIFIED: publish to Redis for role-specific
    broadcastToRoles(roles: string[], event: string, data: any): void {
        const enrichedData = {
            ...data,
            _sse: { event, targetRoles: roles, broadcastTime: getNow().toISOString() }
        };
        if (this.pubClient?.isReady) {
            for (const role of roles) {
                this.pubClient.publish(`sse:roles:${role}`, JSON.stringify({ event, data: enrichedData }));
            }
        } else {
            this.writeToLocalClients(event, enrichedData, { role: roles[0] }); // fallback
        }
    }

    // NEW: Write to local clients only (called by Redis sub handler)
    private writeToLocalClients(event: string, data: any, filter: { userId?: string; role?: string } | null): void {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        this.clients.forEach((client) => {
            if (filter?.userId && client.userId !== filter.userId) return;
            if (filter?.role && client.role !== filter.role) return;
            try {
                client.response.write(message);
            } catch {
                this.removeClient(client.id);
            }
        });
    }

    // MODIFIED: add connection cap and idle timeout
    addClient(id: string, tabId: string, response: Response, userId?: string, role?: string): void {
        // Connection cap
        if (this.clients.size >= this.MAX_CLIENTS) {
            response.status(429).json({ error: 'SSE connection limit reached' });
            response.end();
            return;
        }

        // Per-user cap
        if (userId) {
            const userClients = Array.from(this.clients.values()).filter(c => c.userId === userId);
            if (userClients.length >= this.MAX_CLIENTS_PER_USER) {
                response.status(429).json({ error: 'Too many tabs open' });
                response.end();
                return;
            }
        }

        // ... existing header setup, padding, connection event ...

        this.clients.set(id, { id, tabId, userId, role, response, connectedAt: getNow() });
        this.broadcastClientCount();
    }
}
```

**Also needed in `sse.routes.ts`**:
1. Change heartbeat interval from `10000` (10s) to `30000` (30s) at line 86
2. Add `await sseManager.initPubSub()` call during app startup (in `index.ts` or `sse.routes.ts` on-connect handler)

**IMPORTANT**: `initPubSub()` must be called ONCE at startup, not per-connection. Best place: `backend/src/index.ts` after Redis connects, or in `sse.routes.ts` module-level init.

**Testing**:
1. Start with `PM2_INSTANCES=2`
2. Open browser tab A (connects to worker 1), tab B (connects to worker 2)
3. Create order from tab A → tab B should receive `order:created` event
4. Verify heartbeat every 30s in network tab
5. Open 6th tab for same user → should get 429

**Rollback**: Remove Redis pub/sub init, revert to direct `response.write()` in broadcast methods.

---

### FIX-H2: Cache Stampede Protection

**File**: `backend/src/services/cache.service.ts` (line 136, `getOrSet` method)  
**Risk**: LOW — additive change, existing behavior preserved  
**Rollback**: Remove lock logic  
**Dependencies**: None

**Problem**:
```
TTL expires → 50 concurrent requests → all call fetchFn() → 50 DB queries
Should be: 1 request fetches, 49 wait for result
```

**Spec**:

Add per-key Promise deduplication. When a cache miss occurs, store the fetch Promise. Subsequent requests for the same key await the same Promise instead of re-fetching.

**Implementation**:

```typescript
class CacheService {
    private client: RedisClientType | null = null;
    private isReady = false;
    private readonly DEFAULT_TTL = 3600;

    // NEW: In-flight fetch deduplication
    private inflightFetches: Map<string, Promise<any>> = new Map();

    async getOrSet<T>(
        key: string,
        fetchFn: () => Promise<T>,
        options?: CacheOptions
    ): Promise<T> {
        // Try cache first
        const cached = await this.get<T>(key);
        if (cached !== null) {
            return cached;
        }

        // Check if another request is already fetching this key
        const inflight = this.inflightFetches.get(key);
        if (inflight) {
            return inflight as Promise<T>;
        }

        // We're the first — start fetch and store the Promise
        const fetchPromise = fetchFn()
            .then(async (data) => {
                await this.set(key, data, options);
                return data;
            })
            .finally(() => {
                // Clean up inflight entry
                this.inflightFetches.delete(key);
            });

        this.inflightFetches.set(key, fetchPromise);
        return fetchPromise;
    }
}
```

**Also remove**: All `console.log` calls in `get()`, `set()`, `getOrSet()` — they add I/O overhead. Replace with a `DEBUG_CACHE` env check or remove entirely.

**Testing**:
1. Restart backend (cold cache)
2. Send 50 concurrent requests to `/api/settings`
3. Verify only 1 DB query in Prisma logs (not 50)
4. Verify all 50 requests get the correct response

**Rollback**: Remove `inflightFetches` Map and dedup logic.

---

### FIX-H3: Blacklist Middleware Caching

**File**: `backend/src/middleware/blacklist.middleware.ts` (lines 18-47) + `backend/src/routes/blacklist.routes.ts` (451 lines)  
**Risk**: LOW — additive cache layer, fallback to DB on Redis failure  
**Rollback**: Remove cache check, revert to direct DB query  
**Dependencies**: None

**Problem**: Every order/create request hits `prisma.blacklist.findFirst()` — uncached DB query. `blacklist.routes.ts` currently has NO cache invalidation on any endpoint.

**Spec**: Cache blacklist check result in Redis with 60s TTL, keyed by userId.

**Implementation**:

```typescript
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { getNow } from '../services/time.service';
import { prisma } from '../lib/prisma';
import { cacheService } from '../services/cache.service';

const BLACKLIST_CACHE_TTL = 60; // seconds

export const blacklistMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const cacheKey = `blacklist:active:${userId}`;

        // Check cache first
        const cached = await cacheService.get<{ blacklisted: boolean; entry?: any }>(cacheKey);

        if (cached?.blacklisted) {
            const entry = cached.entry;
            const endDateMessage = entry.endDate
                ? `until ${new Date(entry.endDate).toLocaleDateString()}`
                : 'indefinitely';
            return res.status(403).json({
                error: 'User is blacklisted',
                message: `You are currently blacklisted ${endDateMessage}. Reason: ${entry.reason}`,
                blacklistId: entry.id,
                startDate: entry.startDate,
                endDate: entry.endDate,
                reason: entry.reason,
            });
        }

        if (cached === null) {
            // Cache miss — query DB
            const blacklistEntry = await prisma.blacklist.findFirst({
                where: {
                    userId,
                    isActive: true,
                    OR: [
                        { endDate: null },
                        { endDate: { gt: getNow() } },
                    ],
                },
                select: { id: true, startDate: true, endDate: true, reason: true, user: { select: { name: true, externalId: true } } },
            });

            if (blacklistEntry) {
                // Cache the blacklisted state
                await cacheService.set(cacheKey, { blacklisted: true, entry: blacklistEntry }, { ttl: BLACKLIST_CACHE_TTL });

                const endDateMessage = blacklistEntry.endDate
                    ? `until ${blacklistEntry.endDate.toLocaleDateString()}`
                    : 'indefinitely';
                return res.status(403).json({
                    error: 'User is blacklisted',
                    message: `You are currently blacklisted ${endDateMessage}. Reason: ${blacklistEntry.reason}`,
                    blacklistId: blacklistEntry.id,
                    startDate: blacklistEntry.startDate,
                    endDate: blacklistEntry.endDate,
                    reason: blacklistEntry.reason,
                });
            }

            // Not blacklisted — cache negative result too
            await cacheService.set(cacheKey, { blacklisted: false }, { ttl: BLACKLIST_CACHE_TTL });
        }

        next();
    } catch (error) {
        console.error('Blacklist middleware error:', error);
        // Fail open — allow request if cache/DB fails
        next();
    }
};
```

**Cache Invalidation**: VERIFIED — `blacklist.routes.ts` (451 lines) currently has **NO cache invalidation** on any endpoint. Must add cache deletion in these handlers:

```typescript
// In POST / (create blacklist, around line 89):
await cacheService.delete(`blacklist:active:${userId}`);

// In POST /:id/unblock (line 190):
await cacheService.delete(`blacklist:active:${blacklist.userId}`);

// In PUT /:id (update, line 294):
await cacheService.delete(`blacklist:active:${blacklist.userId}`);

// In POST /reset-strikes (line 360):
await cacheService.delete(`blacklist:active:${userId}`);
```

Also: The scheduler's `checkAndExpireBlacklists()` (`scheduler.ts` line 31) auto-deactivates expired blacklists. After it runs, it should also clear cache for affected users. Currently it only calls `prisma.blacklist.updateMany` — add a cache clear step.

**Testing**:
1. Blacklist a user → first order request → cache miss, DB query, 403
2. Second order request within 60s → cache hit, 403 (no DB query)
3. Admin unblocks user → cache deleted → next order request passes

**Rollback**: Remove cache check, revert to direct `prisma.blacklist.findFirst()`.

---

### FIX-H4: Export Pagination

**File**: `backend/src/routes/order.routes.ts` (lines 1315-1323)  
**Risk**: MEDIUM — changes export behavior  
**Rollback**: Revert to unpaginated export  
**Dependencies**: None

**Problem**: `prisma.order.findMany()` with no `take/skip` loads ALL orders + user + shift + canteen into memory. For 10K orders = ~500MB+ → OOM.

**Spec**: Use cursor-based pagination to stream orders in batches of 1000, building Excel rows incrementally.

**Implementation Sketch**:

```typescript
// Replace lines 1315-1323 with:

const BATCH_SIZE = 1000;
let cursor: string | undefined;
let rowIndex = 4; // Start after header rows
let totalProcessed = 0;

while (true) {
    const batch = await prisma.order.findMany({
        where,
        include: {
            user: { select: { externalId: true, name: true, company: true, division: true, department: true } },
            shift: true,
            canteen: true,
        },
        orderBy: [
            { orderDate: 'desc' },
            { orderTime: 'desc' },
        ],
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (batch.length === 0) break;

    for (const order of batch) {
        // ... existing row-building logic (lines 1442-1555) ...
        // Adapt to write directly to worksheet instead of storing in array
        rowIndex++;
    }

    cursor = batch[batch.length - 1].id;
    totalProcessed += batch.length;

    if (batch.length < BATCH_SIZE) break;
}
```

**Also add**: Safety cap at 50,000 orders per export. If exceeded, return error suggesting narrower date range.

**Testing**:
1. Generate 5000 test orders
2. Export full range → verify all rows present in Excel
3. Monitor memory during export → should stay flat (not spike)

**Rollback**: Revert to single `findMany` call.

---

## 4. Tier 3: Code Changes — MEDIUM Impact

### FIX-M1: Consolidate Redis Clients

**Files**: `backend/src/services/cache.service.ts` (line 19), `backend/src/services/redis.service.ts` (line 13)  
**Risk**: LOW  
**Verified**: `redis.service.ts` exposes `getClient()` at lines 54-56, returns raw Redis client or null.  
**Spec**: `cache.service.ts` should import and reuse `redisService.getClient()` instead of creating its own `createClient()`. Remove `connect()`/`disconnect()` from `CacheService`. Replace `this.client` references with `redisService.getClient()`. Guard all operations with null check (getClient returns null if not connected).

### FIX-M2: Replace KEYS with SCAN

**File**: `backend/src/services/cache.service.ts` (line 99, `delete()` method)  
**Risk**: LOW  
**Spec**: Replace `this.client.keys(pattern)` with `SCAN` cursor iteration:

```typescript
async delete(pattern: string): Promise<boolean> {
    if (!this.isReady || !this.client) return false;
    try {
        if (pattern.includes('*')) {
            let cursor = 0;
            do {
                const result = await this.client.scan(cursor, { MATCH: pattern, COUNT: 100 });
                cursor = result.cursor;
                if (result.keys.length > 0) {
                    await this.client.del(result.keys);
                }
            } while (cursor !== 0);
        } else {
            await this.client.del(pattern);
        }
        return true;
    } catch (error) {
        console.error(`[Cache] Delete error for ${pattern}:`, error);
        return false;
    }
}
```

### FIX-M3: Batch No-Show Processing

**File**: `backend/src/routes/order/admin.ts` (lines 132-194)  
**Risk**: MEDIUM — changes batch processing logic  
**Verified**: Endpoint is `POST /process-noshows` (line 81). Scheduler calls `processNoShows()` at `:05` every hour (`scheduler.ts` line 31). Loop does per-order: `prisma.order.update` (status→NO_SHOW) + `prisma.user.update` (noShowCount++) + `logOrder()` + blacklist check + SSE broadcast.  
**Spec**: Wrap no-show updates in a single `prisma.$transaction` with batch operations. Use `updateMany` for status flip and `updateMany` for user `noShowCount` increment. Keep SSE broadcast outside transaction (fire-and-forget after commit).

### FIX-M4: Batch Cancel Processing

**File**: `backend/src/services/order.service.ts` (lines 103-205, 213-312)  
**Risk**: MEDIUM  
**Spec**: Use `prisma.$transaction` with `updateMany` for batch status flip. Batch message creation. Keep SSE broadcast as-is.

### FIX-M5: Fire-and-Forget Push Notifications

**File**: `backend/src/services/notification.service.ts` (lines 66-179)  
**Risk**: LOW  
**Spec**: After DB write + SSE broadcast (synchronous), offload Web Push + FCM dispatch to a non-blocking background task. Use `setImmediate()` or a simple in-memory queue.

### FIX-M6: Consolidate Rate Limiters

**File**: `backend/src/services/rate-limiter.service.ts`  
**Risk**: LOW  
**Spec**: Migrate login rate limiter (lines 19-219) to use atomic `INCR + EXPIRE` pattern like the API rate limiter (lines 245-290). Eliminate race condition in get-parse-modify-set pattern.

---

## 5. Tier 4: Code Changes — LOW Impact

### FIX-L1: Express Body Size Limit

**File**: `backend/src/index.ts` (line 78)  
**Risk**: VERY LOW  
**Change**: `express.json()` → `express.json({ limit: '1mb' })`

### FIX-L2: Remove Cache console.log

**File**: `backend/src/services/cache.service.ts` (lines 80, 144, 149)  
**Risk**: VERY LOW  
**Change**: Gate behind `process.env.DEBUG_CACHE === 'true'` or remove entirely.

### FIX-L3: Cutoff Middleware Double-Fetch

**File**: `backend/src/middleware/cutoff.middleware.ts` + route handlers  
**Risk**: LOW  
**Verified**: `req.shift` IS attached at line 113 via `(req as any).shift = shift` (cast via `as any`, not typed on AuthRequest).  
**Spec**: Route handlers (e.g. `order/create.ts`) should read `(req as any).shift` instead of re-querying `prisma.shift.findUnique()`. Better: add `shift?: Shift` to `AuthRequest` interface so handlers can use `req.shift` with type safety.

---

## 6. Dependency Graph

```
FIX-C1 (PG tuning) ──────┐
FIX-C2 (Redis limit) ─────┤
FIX-C3 (env vars) ────────┼── Tier 1: No dependencies between items
FIX-C4 (PM2 config) ──────┤   Can be done in any order, single commit
FIX-C5 (frontend nginx) ──┤
FIX-C6 (proxy nginx) ─────┘

FIX-H1 (SSE pub/sub) ──── sse.controller.ts + sse.routes.ts + index.ts (initPubSub)
FIX-H2 (cache stampede) ── Independent, cache.service.ts only
FIX-H3 (blacklist cache) ── blacklist.middleware.ts + blacklist.routes.ts (invalidation)
FIX-H4 (export pagination) ── Independent, order.routes.ts only

FIX-M1 (Redis consolidate) ── Should come AFTER FIX-H2 (cache stampede)
FIX-M2 (KEYS → SCAN) ──────── Should come AFTER FIX-M1
FIX-M3 (batch noshows) ─────── Independent
FIX-M4 (batch cancel) ──────── Independent
FIX-M5 (fire-and-forget push) ── Independent
FIX-M6 (rate limiter) ──────── Independent
```

**Critical path**: FIX-C1 → FIX-C3 → FIX-C4 (all Tier 1, done together) → FIX-H1 (SSE, biggest code change)

---

## 7. Resource Budget

### Before Fixes (Current State)

```
Component           Memory      Status
────────────────────────────────────────
OS + system         1.0 GB
PostgreSQL          ~200 MB     Stock defaults, max_conn=100
Redis               ~50 MB      No memory limit → will grow unbounded
Backend (4 workers) ~4-6 GB     Default heap, 4 × max
Frontend            ~50 MB
────────────────────────────────────────
TOTAL               ~5.3-7.3 GB / 8 GB → NO HEADROOM, CRASH RISK
```

### After All Fixes

```
Component           Memory      Config
────────────────────────────────────────
OS + system         1.0 GB
PostgreSQL          1.0 GB      shared_buffers=256MB, limit=1GB
Redis               0.25 GB     maxmemory=200MB, limit=256MB
Backend (2 workers) 1.5 GB      heap=768MB × 2, limit=1GB × 2
Frontend            0.12 GB     Nginx static, limit=128MB
Docker overhead     0.3 GB
────────────────────────────────────────
TOTAL               4.17 GB / 8 GB = 3.83 GB HEADROOM ✅
```

### DB Connection Budget

```
Before: 4 workers × 50 pool = 200 > PG max 100 → CRASH
After:  2 workers × 20 pool = 40 < PG max 200 → OK (160 spare)
```

---

## 8. Testing Strategy

### Tier 1 Testing (Config)

| Test | Method | Success Criteria |
|------|--------|-----------------|
| PG connections | `SELECT count(*) FROM pg_stat_activity` under load | < 100 active connections |
| PG tuning | `SHOW shared_buffers; SHOW work_mem;` | Correct values |
| Redis memory | `redis-cli INFO memory` | maxmemory=209715200 |
| PM2 workers | `npx pm2 status` | 2 workers, stable |
| Heap limit | `npx pm2 monit` under load | No worker exceeds 768MB |
| Gzip | `curl -H "Accept-Encoding: gzip" -I /api/health` | Content-Encoding: gzip |
| Health check | `docker inspect --format='{{.State.Health.Status}}'` | "healthy" |

### Tier 2 Testing (Code)

| Test | Method | Success Criteria |
|------|--------|-----------------|
| SSE cross-worker | 2 browsers (different workers via round-robin), create order | Both receive `order:created` event |
| SSE connection cap | Open 6 tabs for same user (MAX_CLIENTS_PER_USER=5) | 6th gets 429 "Too many tabs open" |
| SSE heartbeat | Open DevTools Network tab, watch for `event: heartbeat` | Every 30s (not 10s) |
| SSE idle timeout | Open tab, wait 5 min with no activity | Connection closed by server |
| Cache stampede | 50 concurrent requests, cold cache | 1 DB query (not 50) |
| Blacklist cache | 100 order requests for blacklisted user | 1 DB query (first), rest from cache |
| Export pagination | Export 10K orders | No OOM, all rows present |

### Load Testing

```bash
# Install k6 or autocannon
npm install -g autocannon

# Test concurrent order creation
autocannon -c 200 -d 60 -m POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -b '{"shiftId":"...","canteenId":"...","orderDate":"2026-07-15"}' \
  http://localhost:3012/api/orders

# Target: 200 concurrent, < 500ms p95 latency, 0 errors
```

---

## 9. Rollback Plans

### Tier 1 Rollback

Each config file is version-controlled. Rollback = `git checkout HEAD~1 -- docker-compose.yml backend/ecosystem.config.js frontend/nginx.conf nginx/nginx.conf` + rebuild containers.

**Time to rollback**: < 5 minutes (`docker compose down && docker compose up -d`)

### Tier 2 Rollback

Each code fix is a separate commit/PR. Rollback = `git revert <commit>` + rebuild.

**SSE rollback** is safest: Redis pub/sub is additive. If it fails, the in-memory-only behavior still works (just no cross-worker events).

**Cache stampede rollback**: Remove `inflightFetches` Map. Reverts to "thundering herd" behavior but functionally correct.

**Blacklist cache rollback**: Remove cache check. Reverts to per-request DB query.

**Export rollback**: Revert to single `findMany`. Risk of OOM on large exports returns.

---

## 10. Timeline & Effort Estimation

| Phase | Items | Effort | Deliverable |
|-------|-------|--------|-------------|
| **Phase 1**: Config | FIX-C1 to C6 | 1-2 jam | Stable infra, ~500 concurrent |
| **Phase 2**: SSE Pub/Sub | FIX-H1 | 1 hari | Cluster-aware real-time |
| **Phase 3**: Cache + Blacklist | FIX-H2, H3 | 0.5 hari | DB load reduction |
| **Phase 4**: Export | FIX-H4 | 0.5 hari | No OOM on exports |
| **Phase 5**: Medium fixes | FIX-M1 to M6 | 2-3 hari | Stability + headroom |
| **Phase 6**: Low fixes | FIX-L1 to L3 | 0.5 hari | Polish |
| **TOTAL** | 19 items | **5-7 hari** | Production ready |

### Prioritas Eksekusi

```
Hari 1:    Phase 1 (Config) + Phase 2 (SSE) → core infra fixed
Hari 2:    Phase 3 (Cache) + Phase 4 (Export) → HIGH code done
Hari 3-5:  Phase 5 (Medium) → stability
Hari 6:    Phase 6 (Low) + Load testing → polish + verify
Hari 7:    Buffer / production deploy
```

---

## Appendix: File Change Summary

| File | Tier | Changes |
|------|------|---------|
| `docker-compose.yml` | C1-C3 | PG tuning, Redis limits, env vars, resource limits, health checks |
| `docker-compose.npm.yml` | C1-C3 | Same changes (file is identical to docker-compose.yml) |
| `backend/ecosystem.config.js` | C4 | node_args, instances, exp_backoff |
| `frontend/nginx.conf` | C5 | Gzip, sendfile, open_file_cache |
| `nginx/nginx.conf` | C6 | Keepalive upstreams |
| `backend/src/controllers/sse.controller.ts` | H1 | Redis pub/sub, connection caps, idle timeout |
| `backend/src/routes/sse.routes.ts` | H1 | Heartbeat interval 10s→30s, initPubSub() call |
| `backend/src/index.ts` | H1, L1 | SSE initPubSub() at startup, body size limit |
| `backend/src/services/cache.service.ts` | H2, M1, M2, L2 | Stampede dedup, consolidate Redis, SCAN, remove console.log |
| `backend/src/middleware/blacklist.middleware.ts` | H3 | Redis cache layer |
| `backend/src/routes/blacklist.routes.ts` | H3 | Cache invalidation on create/update/delete/unblock/reset |
| `backend/src/routes/order.routes.ts` | H4 | Cursor-based export pagination |
| `backend/src/routes/order/admin.ts` | M3 | Batch no-show processing |
| `backend/src/services/order.service.ts` | M4 | Batch cancel processing |
| `backend/src/services/notification.service.ts` | M5 | Fire-and-forget push |
| `backend/src/services/rate-limiter.service.ts` | M6 | Atomic INCR rate limiter |

---

## Appendix B: Codebase Verification Notes

Spec ini telah diverifikasi terhadap kode aktual (2026-07-14). Koreksi dari draft awal:

| Item | Draft Awal | Hasil Verifikasi |
|------|-----------|-----------------|
| SSE heartbeat | "Tidak ada heartbeat" | **Sudah ada** di `sse.routes.ts` line 86-97, interval 10s |
| SSE addClient return | `boolean` | `void` — routes tidak check return value |
| Redis getClient() | "Perlu dicek" | **Sudah ada** di `redis.service.ts` line 54-56 |
| req.shift attachment | "Perlu dicek" | **Sudah ada** di `cutoff.middleware.ts` line 113, via `as any` |
| Blacklist cache invalidation | "Tambah ke handlers" | **Belum ada** sama sekali di `blacklist.routes.ts` — confirmed perlu ditambah |
| PM2_INSTANCES env var | "Set PM2_INSTANCES: '2'" | Perlu dicocokkan: ecosystem.config.js reads `process.env.PM2_INSTANCES` (case-sensitive) |
| docker-compose files | "Ada beberapa versi" | `docker-compose.yml` dan `docker-compose.npm.yml` **identical** |
| Scheduler no-show | "Setiap jam" | `:05` setiap jam (`scheduler.ts` line 31), PM2 cluster guard via `INSTANCE_ID` |
| Nginx location | Referenced in FIX-C6 | `nginx/nginx.conf` (non-NPM variant), `frontend/nginx.conf` (inside frontend container) |

**Total files yang perlu diubah**: 15 files (6 config + 9 code)
