import 'dotenv/config';  // Load .env file FIRST before other imports
import express from 'express';
import cors from 'cors';
import compression from 'compression';
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

import { sseManager } from './controllers/sse.controller';
import { startScheduler } from './services/scheduler';
import { initNTPService, getNow } from './services/time.service';
import { redisService } from './services/redis.service';
import { cacheService } from './services/cache.service';
import { prisma } from './lib/prisma';
import { logServerStart, logServerStop } from './services/uptime.service';

const app = express();
const PORT = process.env.PORT || 3012;

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3011',
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'],
}));
app.use(compression()); // Enable gzip compression
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Trust proxy for proper IP detection (behind reverse proxy/load balancer)
app.set('trust proxy', true);

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



// Error handling middleware (centralized)
import { errorHandler } from './middleware/error.middleware';
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    await logServerStop('SIGTERM received');
    await redisService.disconnect();
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down...');
    await logServerStop('SIGINT received');
    await redisService.disconnect();
    await prisma.$disconnect();
    process.exit(0);
});

app.listen(PORT, async () => {
    console.log(`🚀 Catering API running on http://localhost:${PORT}`);
    console.log(`📡 SSE endpoint: http://localhost:${PORT}/api/sse`);

    // Initialize Redis
    await redisService.connect();

    // Initialize Cache Service
    await cacheService.connect();

    // Initialize NTP service
    await initNTPService();

    // Start the no-show scheduler
    startScheduler();

    // Log server startup
    await logServerStart('Server startup complete');
});

export { prisma, sseManager };

