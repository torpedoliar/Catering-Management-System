import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { sseManager } from '../controllers/sse.controller';
import { getNow } from '../services/time.service';
import { ErrorMessages } from '../utils/errorMessages';
import { cacheService, CACHE_KEYS, CACHE_TTL } from '../services/cache.service';
import { logSettings, getRequestContext } from '../services/audit.service';
import { OrderService } from '../services/order.service';
import { getToday } from '../services/time.service';
import { prisma } from '../lib/prisma';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const router = Router();

// Branding upload configuration
const brandingStorage = multer.memoryStorage();
const brandingUpload = multer({
    storage: brandingStorage,
    limits: { fileSize: 500 * 1024 }, // 500KB
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/png', 'image/svg+xml', 'image/x-icon', 'image/jpeg', 'image/webp', 'image/vnd.microsoft.icon'];
        cb(null, allowed.includes(file.mimetype));
    }
});

// Ensure branding directory exists
const brandingDir = path.join(process.cwd(), 'uploads', 'branding');
if (!fs.existsSync(brandingDir)) {
    fs.mkdirSync(brandingDir, { recursive: true });
}

// Get settings (with caching)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const settings = await cacheService.getOrSet(
            CACHE_KEYS.SETTINGS,
            async () => {
                let settings = await prisma.settings.findUnique({
                    where: { id: 'default' },
                });

                if (!settings) {
                    settings = await prisma.settings.create({
                        data: {
                            id: 'default',
                            cutoffMode: 'per-shift',
                            cutoffDays: 0,
                            cutoffHours: 6,
                            maxOrderDaysAhead: 7,
                            weeklyCutoffDay: 5,
                            weeklyCutoffHour: 17,
                            weeklyCutoffMinute: 0,
                            orderableDays: '1,2,3,4,5,6',
                            maxWeeksAhead: 1,
                            blacklistStrikes: 3,
                            blacklistDuration: 7,
                        },
                    });
                }

                return settings;
            },
            { ttl: CACHE_TTL.SETTINGS }
        );

        res.json(settings);
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Update settings (Admin only)
router.put('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const {
            cutoffMode,
            cutoffDays,
            cutoffHours,
            maxOrderDaysAhead,
            weeklyCutoffDay,
            weeklyCutoffHour,
            weeklyCutoffMinute,
            orderableDays,
            maxWeeksAhead,
            blacklistStrikes,
            blacklistDuration,
            enforceCanteenCheckin,
        } = req.body;

        // Validate per-shift mode values
        if (cutoffDays !== undefined && (cutoffDays < 0 || cutoffDays > 30)) {
            return res.status(400).json({ error: ErrorMessages.CUTOFF_DAYS_INVALID });
        }
        if (cutoffHours !== undefined && (cutoffHours < 0 || cutoffHours > 23)) {
            return res.status(400).json({ error: ErrorMessages.CUTOFF_HOURS_INVALID });
        }
        if (blacklistStrikes !== undefined && blacklistStrikes < 1) {
            return res.status(400).json({ error: ErrorMessages.BLACKLIST_STRIKES_INVALID });
        }
        if (blacklistDuration !== undefined && blacklistDuration < 1) {
            return res.status(400).json({ error: 'Durasi blacklist minimal 1 hari' });
        }
        if (maxOrderDaysAhead !== undefined && (maxOrderDaysAhead < 1 || maxOrderDaysAhead > 30)) {
            return res.status(400).json({ error: 'Max order days ahead must be between 1 and 30' });
        }

        // Validate weekly mode values
        if (weeklyCutoffDay !== undefined && (weeklyCutoffDay < 0 || weeklyCutoffDay > 6)) {
            return res.status(400).json({ error: 'Hari cutoff harus antara 0 (Minggu) - 6 (Sabtu)' });
        }
        if (weeklyCutoffHour !== undefined && (weeklyCutoffHour < 0 || weeklyCutoffHour > 23)) {
            return res.status(400).json({ error: 'Jam cutoff harus antara 0-23' });
        }
        if (weeklyCutoffMinute !== undefined && (weeklyCutoffMinute < 0 || weeklyCutoffMinute > 59)) {
            return res.status(400).json({ error: 'Menit cutoff harus antara 0-59' });
        }
        if (maxWeeksAhead !== undefined && (maxWeeksAhead < 1 || maxWeeksAhead > 4)) {
            return res.status(400).json({ error: 'Maksimal minggu ke depan harus antara 1-4' });
        }

        // Get old settings for audit
        const oldSettings = await prisma.settings.findUnique({ where: { id: 'default' } });

        const settings = await prisma.settings.upsert({
            where: { id: 'default' },
            update: {
                ...(cutoffMode !== undefined && { cutoffMode }),
                ...(cutoffDays !== undefined && { cutoffDays }),
                ...(cutoffHours !== undefined && { cutoffHours }),
                ...(maxOrderDaysAhead !== undefined && { maxOrderDaysAhead }),
                ...(weeklyCutoffDay !== undefined && { weeklyCutoffDay }),
                ...(weeklyCutoffHour !== undefined && { weeklyCutoffHour }),
                ...(weeklyCutoffMinute !== undefined && { weeklyCutoffMinute }),
                ...(orderableDays !== undefined && { orderableDays }),
                ...(maxWeeksAhead !== undefined && { maxWeeksAhead }),
                ...(blacklistStrikes !== undefined && { blacklistStrikes }),
                ...(blacklistDuration !== undefined && { blacklistDuration }),
                ...(enforceCanteenCheckin !== undefined && { enforceCanteenCheckin }),
            },
            create: {
                id: 'default',
                cutoffMode: cutoffMode || 'per-shift',
                cutoffDays: cutoffDays || 0,
                cutoffHours: cutoffHours || 6,
                maxOrderDaysAhead: maxOrderDaysAhead || 7,
                weeklyCutoffDay: weeklyCutoffDay || 5,
                weeklyCutoffHour: weeklyCutoffHour || 17,
                weeklyCutoffMinute: weeklyCutoffMinute || 0,
                orderableDays: orderableDays || '1,2,3,4,5,6',
                maxWeeksAhead: maxWeeksAhead || 1,
                blacklistStrikes: blacklistStrikes || 3,
                blacklistDuration: blacklistDuration || 7,
            },
        });

        // Check if maxOrderDaysAhead is reduced, if so, cancel excess orders
        if (maxOrderDaysAhead !== undefined && oldSettings?.maxOrderDaysAhead && maxOrderDaysAhead < oldSettings.maxOrderDaysAhead) {
            console.log(`[Settings] Max order days reduced from ${oldSettings.maxOrderDaysAhead} to ${maxOrderDaysAhead}. Processing auto-cancellations...`);

            // Calculate last allowed date
            const today = getToday();
            // date = today + maxDays;
            const maxValidDate = new Date(today);
            maxValidDate.setDate(maxValidDate.getDate() + maxOrderDaysAhead);
            maxValidDate.setHours(23, 59, 59, 999); // End of that day

            // Run cancellation in background to not block response? 
            // Better to await it to ensure consistency, loop is usually fast enough for moderate data.
            await OrderService.cancelOrdersBeyondDate(maxValidDate, `Kebijakan batas pemesanan diubah menjadi ${maxOrderDaysAhead} hari ke depan`);
        }

        // Log audit
        await logSettings(req.user || null, oldSettings, settings, getRequestContext(req), { settingsType: 'System Settings' });

        // Invalidate settings cache
        await cacheService.delete(CACHE_KEYS.SETTINGS);

        // Broadcast settings update to all clients
        sseManager.broadcast('settings:updated', {
            settings,
            timestamp: getNow().toISOString(),
        });

        res.json(settings);
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// =============================================================================
// BRANDING ENDPOINTS
// =============================================================================

// GET /api/settings/branding - Public branding data (no auth required)
router.get('/branding', async (_req, res: Response) => {
    try {
        let settings = await prisma.settings.findUnique({
            where: { id: 'default' },
            select: {
                appName: true,
                appShortName: true,
                logoUrl: true,
                faviconUrl: true,
            }
        });

        if (!settings) {
            settings = {
                appName: 'Catering Management System',
                appShortName: 'Catering',
                logoUrl: null,
                faviconUrl: null,
            };
        }

        res.json(settings);
    } catch (error) {
        console.error('Get branding error:', error);
        res.status(500).json({ error: 'Failed to get branding' });
    }
});

// POST /api/settings/branding/logo - Upload main logo
router.post('/branding/logo', authMiddleware, adminMiddleware, brandingUpload.single('logo'), async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Get existing settings to delete old logo
        const existing = await prisma.settings.findUnique({ where: { id: 'default' } });
        if (existing?.logoUrl) {
            const oldPath = path.join(process.cwd(), existing.logoUrl);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        // Process and save logo
        let logoUrl: string;
        const timestamp = Date.now();

        if (req.file.mimetype === 'image/svg+xml') {
            // Keep SVG as-is
            const filename = `logo-${timestamp}.svg`;
            const filepath = path.join(brandingDir, filename);
            fs.writeFileSync(filepath, req.file.buffer);
            logoUrl = `/uploads/branding/${filename}`;
        } else {
            // Convert to WebP for other formats
            const filename = `logo-${timestamp}.webp`;
            const filepath = path.join(brandingDir, filename);
            await sharp(req.file.buffer)
                .resize(200, 200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .webp({ quality: 90 })
                .toFile(filepath);
            logoUrl = `/uploads/branding/${filename}`;
        }

        // Update settings
        const settings = await prisma.settings.upsert({
            where: { id: 'default' },
            update: { logoUrl },
            create: { id: 'default', logoUrl }
        });

        // Invalidate cache
        await cacheService.delete(CACHE_KEYS.SETTINGS);

        // Broadcast update
        sseManager.broadcast('branding:updated', { logoUrl, timestamp: getNow().toISOString() });

        res.json({ logoUrl, message: 'Logo uploaded successfully' });
    } catch (error) {
        console.error('Upload logo error:', error);
        res.status(500).json({ error: 'Failed to upload logo' });
    }
});

// POST /api/settings/branding/favicon - Upload favicon
router.post('/branding/favicon', authMiddleware, adminMiddleware, brandingUpload.single('favicon'), async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Get existing settings to delete old favicon
        const existing = await prisma.settings.findUnique({ where: { id: 'default' } });
        if (existing?.faviconUrl) {
            const oldPath = path.join(process.cwd(), existing.faviconUrl);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        // Process and save favicon
        let faviconUrl: string;
        const timestamp = Date.now();

        if (req.file.mimetype === 'image/svg+xml' || req.file.mimetype === 'image/x-icon' || req.file.mimetype === 'image/vnd.microsoft.icon') {
            // Keep SVG/ICO as-is
            const ext = req.file.mimetype === 'image/svg+xml' ? 'svg' : 'ico';
            const filename = `favicon-${timestamp}.${ext}`;
            const filepath = path.join(brandingDir, filename);
            fs.writeFileSync(filepath, req.file.buffer);
            faviconUrl = `/uploads/branding/${filename}`;
        } else {
            // Convert to PNG for favicons (better browser support than WebP)
            const filename = `favicon-${timestamp}.png`;
            const filepath = path.join(brandingDir, filename);
            await sharp(req.file.buffer)
                .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toFile(filepath);
            faviconUrl = `/uploads/branding/${filename}`;
        }

        // Update settings
        await prisma.settings.upsert({
            where: { id: 'default' },
            update: { faviconUrl },
            create: { id: 'default', faviconUrl }
        });

        // Invalidate cache
        await cacheService.delete(CACHE_KEYS.SETTINGS);

        // Broadcast update
        sseManager.broadcast('branding:updated', { faviconUrl, timestamp: getNow().toISOString() });

        res.json({ faviconUrl, message: 'Favicon uploaded successfully' });
    } catch (error) {
        console.error('Upload favicon error:', error);
        res.status(500).json({ error: 'Failed to upload favicon' });
    }
});

// PUT /api/settings/branding - Update app name/short name
router.put('/branding', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { appName, appShortName } = req.body;

        const settings = await prisma.settings.upsert({
            where: { id: 'default' },
            update: {
                ...(appName !== undefined && { appName }),
                ...(appShortName !== undefined && { appShortName }),
            },
            create: {
                id: 'default',
                appName: appName || 'Catering Management System',
                appShortName: appShortName || 'Catering',
            }
        });

        // Invalidate cache
        await cacheService.delete(CACHE_KEYS.SETTINGS);

        // Broadcast update
        sseManager.broadcast('branding:updated', { appName: settings.appName, appShortName: settings.appShortName, timestamp: getNow().toISOString() });

        res.json({ appName: settings.appName, appShortName: settings.appShortName, message: 'Branding updated' });
    } catch (error) {
        console.error('Update branding error:', error);
        res.status(500).json({ error: 'Failed to update branding' });
    }
});

// DELETE /api/settings/branding/logo - Remove logo (reset to default)
router.delete('/branding/logo', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const existing = await prisma.settings.findUnique({ where: { id: 'default' } });

        if (existing?.logoUrl) {
            const oldPath = path.join(process.cwd(), existing.logoUrl);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        await prisma.settings.update({
            where: { id: 'default' },
            data: { logoUrl: null }
        });

        await cacheService.delete(CACHE_KEYS.SETTINGS);
        sseManager.broadcast('branding:updated', { logoUrl: null, timestamp: getNow().toISOString() });

        res.json({ message: 'Logo removed' });
    } catch (error) {
        console.error('Delete logo error:', error);
        res.status(500).json({ error: 'Failed to remove logo' });
    }
});

// DELETE /api/settings/branding/favicon - Remove favicon (reset to default)
router.delete('/branding/favicon', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const existing = await prisma.settings.findUnique({ where: { id: 'default' } });

        if (existing?.faviconUrl) {
            const oldPath = path.join(process.cwd(), existing.faviconUrl);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        await prisma.settings.update({
            where: { id: 'default' },
            data: { faviconUrl: null }
        });

        await cacheService.delete(CACHE_KEYS.SETTINGS);
        sseManager.broadcast('branding:updated', { faviconUrl: null, timestamp: getNow().toISOString() });

        res.json({ message: 'Favicon removed' });
    } catch (error) {
        console.error('Delete favicon error:', error);
        res.status(500).json({ error: 'Failed to remove favicon' });
    }
});

export default router;
