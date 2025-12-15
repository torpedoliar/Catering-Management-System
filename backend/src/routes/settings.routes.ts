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

const router = Router();

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
                            cutoffHours: 6,
                            blacklistStrikes: 3,
                            blacklistDuration: 7,
                            maxOrderDaysAhead: 7,
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
        const { cutoffHours, blacklistStrikes, blacklistDuration, maxOrderDaysAhead } = req.body;

        // Validate values
        if (cutoffHours !== undefined && (cutoffHours < 0 || cutoffHours > 24)) {
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

        // Get old settings for audit
        const oldSettings = await prisma.settings.findUnique({ where: { id: 'default' } });

        const settings = await prisma.settings.upsert({
            where: { id: 'default' },
            update: {
                ...(cutoffHours !== undefined && { cutoffHours }),
                ...(blacklistStrikes !== undefined && { blacklistStrikes }),
                ...(blacklistDuration !== undefined && { blacklistDuration }),
                ...(maxOrderDaysAhead !== undefined && { maxOrderDaysAhead }),
            },
            create: {
                id: 'default',
                cutoffHours: cutoffHours || 6,
                blacklistStrikes: blacklistStrikes || 3,
                blacklistDuration: blacklistDuration || 7,
                maxOrderDaysAhead: maxOrderDaysAhead || 7,
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

export default router;
