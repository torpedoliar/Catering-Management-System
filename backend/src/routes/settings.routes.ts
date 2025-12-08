import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { sseManager } from '../controllers/sse.controller';
import { getNow } from '../services/time.service';
import { ErrorMessages } from '../utils/errorMessages';
import { logSettings, getRequestContext } from '../services/audit.service';

const router = Router();
const prisma = new PrismaClient();

// Get settings
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
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

        // Log audit
        await logSettings(req.user || null, oldSettings, settings, getRequestContext(req), { settingsType: 'System Settings' });

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
