import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import {
    getTimeInfo,
    getNTPSettings,
    updateNTPSettings,
    syncNTP,
    getTimezones,
    getNTPServers,
    getNow
} from '../services/time.service';

const router = Router();

// Get current server time (public endpoint for sync)
router.get('/now', async (req, res: Response) => {
    try {
        const now = getNow();
        res.json({
            time: now.toISOString(),
            timestamp: now.getTime(),
            formatted: now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
        });
    } catch (error) {
        console.error('Get time error:', error);
        res.status(500).json({ error: 'Failed to get current time' });
    }
});

// Get full time info (requires auth)
router.get('/info', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const info = await getTimeInfo();
        res.json(info);
    } catch (error) {
        console.error('Get time info error:', error);
        res.status(500).json({ error: 'Failed to get time info' });
    }
});

// Get NTP settings (Admin only)
router.get('/ntp', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const settings = await getNTPSettings();
        res.json(settings);
    } catch (error) {
        console.error('Get NTP settings error:', error);
        res.status(500).json({ error: 'Failed to get NTP settings' });
    }
});

// Update NTP settings (Admin only)
router.put('/ntp', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { ntpEnabled, ntpServer, ntpTimezone, ntpSyncInterval } = req.body;

        // Validate values
        if (ntpSyncInterval !== undefined && (ntpSyncInterval < 60 || ntpSyncInterval > 86400)) {
            return res.status(400).json({ 
                error: 'Sync interval must be between 60 seconds and 86400 seconds (24 hours)' 
            });
        }

        if (ntpServer !== undefined && typeof ntpServer !== 'string') {
            return res.status(400).json({ error: 'NTP server must be a valid string' });
        }

        if (ntpTimezone !== undefined) {
            const validTimezones = getTimezones();
            if (!validTimezones.includes(ntpTimezone)) {
                return res.status(400).json({ 
                    error: 'Invalid timezone',
                    validTimezones 
                });
            }
        }

        const settings = await updateNTPSettings({
            ntpEnabled,
            ntpServer,
            ntpTimezone,
            ntpSyncInterval
        });

        res.json(settings);
    } catch (error) {
        console.error('Update NTP settings error:', error);
        res.status(500).json({ error: 'Failed to update NTP settings' });
    }
});

// Force NTP sync (Admin only)
router.post('/ntp/sync', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const result = await syncNTP();
        
        if (result.success) {
            res.json({
                success: true,
                message: 'NTP sync completed',
                offset: result.offset
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'NTP sync failed',
                error: result.error,
                offset: result.offset
            });
        }
    } catch (error) {
        console.error('NTP sync error:', error);
        res.status(500).json({ error: 'Failed to sync with NTP server' });
    }
});

// Get available timezones
router.get('/timezones', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const timezones = getTimezones();
        res.json(timezones);
    } catch (error) {
        console.error('Get timezones error:', error);
        res.status(500).json({ error: 'Failed to get timezones' });
    }
});

// Get available NTP servers
router.get('/ntp-servers', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const servers = getNTPServers();
        res.json(servers);
    } catch (error) {
        console.error('Get NTP servers error:', error);
        res.status(500).json({ error: 'Failed to get NTP servers' });
    }
});

export default router;
