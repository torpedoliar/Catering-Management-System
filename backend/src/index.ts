import 'dotenv/config';  // Load .env file FIRST before other imports

// FORCE NODE ENVIRONMENT TO UTC FOR FAKE-UTC SHIFTING LOGIC TO WORK
process.env.TZ = 'UTC';

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser'; // R-005: For HttpOnly refresh token cookies
import path from 'path';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import orderRoutes from './routes/order';  // Using new modular structure
import orderLegacyRoutes from './routes/order.routes'; // Keep for stats/export routes
import shiftRoutes from './routes/shift.routes';
import blacklistRoutes from './routes/blacklist.routes';
import settingsRoutes from './routes/settings.routes';
import companyRoutes from './routes/company.routes';
import holidayRoutes from './routes/holiday.routes';
import sseRoutes from './routes/sse.routes';
import timeRoutes from './routes/time.routes';
import auditRoutes from './routes/audit.routes';
import messageRoutes from './routes/message.routes';
import announcementRoutes from './routes/announcement.routes';
import emailRoutes from './routes/email.routes';
import serverRoutes from './routes/server.routes';
import canteenRoutes from './routes/canteen.routes';
import vendorRoutes from './routes/vendor.routes';
import vendorManagementRoutes from './routes/vendor-management.routes';
import menuItemRoutes from './routes/menu-item.routes';
import weeklyMenuRoutes from './routes/weekly-menu.routes';
import versionRoutes from './routes/version.routes';
import notificationRoutes from './routes/notification.routes';

import { sseManager } from './controllers/sse.controller';
import { startScheduler } from './services/scheduler';
import { initNTPService, getNow } from './services/time.service';
import { redisService } from './services/redis.service';
import { cacheService } from './services/cache.service';
import { prisma } from './lib/prisma';
import { logServerStart, logServerStop } from './services/uptime.service';

const app = express();
const PORT = process.env.PORT || 3012;

// R-006: Suppress X-Powered-By header to prevent technology disclosure
app.disable('x-powered-by');

// I-6 (Wave 2): CORS_ORIGIN validation. With credentials: true, the
// browser refuses CORS responses that have Access-Control-Allow-Origin:
// *. The previous code silently fell through to localhost:3011 in that
// case, breaking refresh-token cookie auth in production. Now we
// fail-fast on misconfiguration.
const rawCorsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3011';
if (rawCorsOrigin.trim() === '*') {
    console.error('[CORS] CORS_ORIGIN=* is not allowed with credentials: true. Refusing to boot.');
    process.exit(1);
}
const allowedCorsOrigins = rawCorsOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        // Allow non-browser requests (no Origin header — server-to-server,
        // curl, mobile native) by passing the first allowed origin.
        if (!origin) return callback(null, allowedCorsOrigins[0]);
        if (allowedCorsOrigins.includes(origin)) return callback(null, origin);
        return callback(new Error(`CORS origin ${origin} not allowed`));
    },
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'],
}));
app.use(compression()); // Enable gzip compression
app.use(cookieParser()); // R-005: Parse cookies for HttpOnly refresh token
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Trust proxy for proper IP detection (behind reverse proxy/load balancer)
app.set('trust proxy', true);

// NOTE: Security headers (HSTS, CSP, X-Frame-Options, etc.) are centralized
// in the NPM/openresty layer to cover ALL responses including SPA root HTML.
// Do NOT add them here to avoid duplicate header injection (F-001/F-004 retest).

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: getNow().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);          // New modular routes
app.use('/api/orders', orderLegacyRoutes);    // Legacy routes (stats, export)
app.use('/api/shifts', shiftRoutes);
app.use('/api/blacklist', blacklistRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/canteens', canteenRoutes);
app.use('/api/sse', sseRoutes);
app.use('/api/time', timeRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/server', serverRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/vendors', vendorManagementRoutes);
app.use('/api/menu-items', menuItemRoutes);
app.use('/api/weekly-menu', weeklyMenuRoutes);
app.use('/api/version', versionRoutes);
app.use('/api/notifications', notificationRoutes);


// Error handling middleware (centralized)
import { errorHandler } from './middleware/error.middleware';
app.use(errorHandler);

// Graceful shutdown — I-2 (Wave 2)
//
// On SIGTERM/SIGINT: stop accepting new connections, drain in-flight
// requests, close SSE clients cleanly, stop cron + NTP timers, then
// close service connections in reverse-startup order. If any step
// throws, we record the failure and exit non-zero so PM2/Docker can
// distinguish a clean stop from a crash.
let isShuttingDown = false;

async function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`${signal} received, draining...`);
    process.exitCode = 0;

    try {
        // 1. Stop accepting new connections. The httpServer is created
        //    by app.listen — capture the reference so we can close it.
        const server = (app as any).server as import('http').Server | undefined;
        const closeServer = server ? new Promise<void>((resolve) => {
            server.close((err) => {
                if (err) console.error('[shutdown] http server close error:', err);
                resolve();
            });
            // Force-close idle connections after 5s
            setTimeout(() => {
                if (typeof server.closeIdleConnections === 'function') {
                    server.closeIdleConnections();
                }
            }, 5000).unref();
        }) : Promise.resolve();

        // 2. Drain SSE clients
        try {
            sseManager.closeAllClients();
        } catch (e) {
            console.error('[shutdown] sse close error:', e);
        }

        // 3. Stop cron + NTP schedulers
        try {
            const { stopScheduler } = await import('./services/scheduler');
            stopScheduler();
        } catch (e) {
            console.error('[shutdown] scheduler stop error:', e);
        }
        try {
            const { stopNTPScheduler } = await import('./services/time.service');
            stopNTPScheduler();
        } catch (e) {
            console.error('[shutdown] NTP stop error:', e);
        }

        // 4. Wait for in-flight requests to settle (best-effort)
        await closeServer;

        // 5. Close services in reverse-startup order
        await logServerStop(`${signal} received`);
        try { await sseManager.disconnect(); } catch (e) { console.error('[shutdown] sse pub/sub:', e); }
        try { await cacheService.disconnect(); } catch (e) { console.error('[shutdown] cacheService:', e); }
        try { await redisService.disconnect(); } catch (e) { console.error('[shutdown] redis:', e); }
        try { await prisma.$disconnect(); } catch (e) { console.error('[shutdown] prisma:', e); }

        console.log(`${signal} drained, exiting.`);
    } catch (err) {
        console.error(`[shutdown] Error during ${signal}:`, err);
        process.exitCode = 1;
    } finally {
        // Belt-and-suspenders: hard-exit after 10s no matter what
        setTimeout(() => process.exit(process.exitCode ?? 0), 10000).unref();
    }
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });

app.listen(PORT, async () => {
    console.log(`🚀 Catering API running on http://localhost:${PORT}`);
    console.log(`📡 SSE endpoint: http://localhost:${PORT}/api/sse`);

    // Initialize Redis
    await redisService.connect();

    // Initialize Cache Service
    await cacheService.connect();

    // FIX-H1: Initialize SSE Redis pub/sub for cluster awareness
    await sseManager.initPubSub();

    // Initialize NTP service
    await initNTPService();

    // Start the no-show scheduler
    startScheduler();

    // Log server startup - detect if this is an update restart
    // Check both env var and marker file (for Docker deployments)
    let isUpdateRestart = process.env.UPDATE_RESTART === 'true';

    // Check marker file for Docker deployments
    const fs = await import('fs');
    const markerPath = '/tmp/update_restart_marker';
    try {
        if (fs.existsSync(markerPath)) {
            isUpdateRestart = true;
            fs.unlinkSync(markerPath); // Remove marker after reading
            console.log('🔄 [Uptime] Detected update restart via marker file');
        }
    } catch (_err: unknown) {
        // Ignore file system errors
    }

    const startupNotes = isUpdateRestart ? 'Application Update Restart' : 'Server startup complete';
    await logServerStart(startupNotes);

    if (isUpdateRestart) {
        console.log('🔄 [Uptime] Logged restart as application update');
    }

    // Start refresh token cleanup interval (runs daily)
    const { cleanupExpiredTokens } = await import('./services/token-cleanup.service');
    // Run once on startup
    cleanupExpiredTokens();
    // Then every 24 hours
    setInterval(cleanupExpiredTokens, 24 * 60 * 60 * 1000);
});

export { prisma, sseManager };

