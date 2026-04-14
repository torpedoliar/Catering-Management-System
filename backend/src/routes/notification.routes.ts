import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';

const router = Router();
router.use(authMiddleware);

// Get my notifications
router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: req.user!.id },
            orderBy: { createdAt: 'desc' },
            take: 30 // Top 30 for the bell drop-down
        });
        
        const unreadCount = await prisma.notification.count({
            where: { userId: req.user!.id, isRead: false }
        });

        res.json({ notifications, unreadCount });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark single notification as read
router.put('/:id/read', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const notification = await prisma.notification.updateMany({
            where: { id, userId: req.user!.id },
            data: { isRead: true }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error reading notification:', error);
        res.status(500).json({ error: 'Failed to mark read' });
    }
});

// Mark all as read
router.put('/read-all', async (req: AuthRequest, res: Response) => {
    try {
        await prisma.notification.updateMany({
            where: { userId: req.user!.id, isRead: false },
            data: { isRead: true }
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error reading all notifications:', error);
        res.status(500).json({ error: 'Failed to mark all as read' });
    }
});

// Subscribe to Web Push
router.post('/subscribe', async (req: AuthRequest, res: Response) => {
    try {
        const { endpoint, keys } = req.body;
        
        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ error: 'Invalid subscription object' });
        }

        // Upsert by endpoint to avoid duplicates
        await prisma.pushSubscription.upsert({
            where: { endpoint },
            create: {
                userId: req.user!.id,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth
            },
            update: {
                userId: req.user!.id,
                p256dh: keys.p256dh,
                auth: keys.auth
            }
        });

        res.status(201).json({ success: true });
    } catch (error) {
        console.error('Failed subscribing to push:', error);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// Unsubscribe
router.post('/unsubscribe', async (req: AuthRequest, res: Response) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

        await prisma.pushSubscription.deleteMany({
            where: { endpoint, userId: req.user!.id }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Failed unsubscribing from push:', error);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

// Subscribe to FCM Push (Native Android/iOS)
router.post('/fcm-subscribe', async (req: AuthRequest, res: Response) => {
    try {
        const { fcmToken } = req.body;
        
        if (!fcmToken) {
            return res.status(400).json({ error: 'Missing fcmToken' });
        }

        await prisma.pushSubscription.upsert({
            where: { fcmToken },
            create: {
                userId: req.user!.id,
                fcmToken,
            },
            update: {
                userId: req.user!.id,
            }
        });

        res.status(201).json({ success: true });
    } catch (error) {
        console.error('Failed subscribing to FCM push:', error);
        res.status(500).json({ error: 'Failed to subscribe to FCM' });
    }
});

// Unsubscribe from FCM
router.post('/fcm-unsubscribe', async (req: AuthRequest, res: Response) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken) return res.status(400).json({ error: 'Missing fcmToken' });

        await prisma.pushSubscription.deleteMany({
            where: { fcmToken, userId: req.user!.id }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Failed unsubscribing from FCM push:', error);
        res.status(500).json({ error: 'Failed to unsubscribe from FCM' });
    }
});

export default router;
