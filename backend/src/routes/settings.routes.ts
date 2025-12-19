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

export default router;
