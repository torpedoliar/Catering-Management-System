import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { sseManager } from '../controllers/sse.controller';
import { getNow } from '../services/time.service';

const router = Router();
const prisma = new PrismaClient();

// Get all active announcements (for users)
router.get('/active', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const now = getNow();

        const announcements = await prisma.announcement.findMany({
            where: {
                isActive: true,
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: now } }
                ]
            },
            include: {
                createdBy: {
                    select: { name: true, externalId: true }
                }
            },
            orderBy: [
                { priority: 'desc' },
                { createdAt: 'desc' }
            ]
        });

        res.json({ announcements });
    } catch (error) {
        console.error('Get active announcements error:', error);
        res.status(500).json({ error: 'Failed to get announcements' });
    }
});

// Get all announcements (admin)
router.get('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const announcements = await prisma.announcement.findMany({
            include: {
                createdBy: {
                    select: { name: true, externalId: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ announcements });
    } catch (error) {
        console.error('Get announcements error:', error);
        res.status(500).json({ error: 'Failed to get announcements' });
    }
});

// Create new announcement (admin)
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { title, content, priority, expiresAt } = req.body;
        const userId = req.user?.id;

        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required' });
        }

        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const announcement = await prisma.announcement.create({
            data: {
                title,
                content,
                priority: priority || 'normal',
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                createdById: userId
            },
            include: {
                createdBy: {
                    select: { name: true, externalId: true }
                }
            }
        });

        // Broadcast to all clients via SSE
        sseManager.broadcast('announcement:created', {
            announcement,
            timestamp: getNow().toISOString()
        });

        res.status(201).json(announcement);
    } catch (error) {
        console.error('Create announcement error:', error);
        res.status(500).json({ error: 'Failed to create announcement' });
    }
});

// Update announcement (admin)
router.put('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { title, content, priority, isActive, expiresAt } = req.body;

        const announcement = await prisma.announcement.update({
            where: { id },
            data: {
                ...(title !== undefined && { title }),
                ...(content !== undefined && { content }),
                ...(priority !== undefined && { priority }),
                ...(isActive !== undefined && { isActive }),
                ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null })
            },
            include: {
                createdBy: {
                    select: { name: true, externalId: true }
                }
            }
        });

        // Broadcast update
        sseManager.broadcast('announcement:updated', {
            announcement,
            timestamp: getNow().toISOString()
        });

        res.json(announcement);
    } catch (error) {
        console.error('Update announcement error:', error);
        res.status(500).json({ error: 'Failed to update announcement' });
    }
});

// Delete announcement (admin)
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        await prisma.announcement.delete({
            where: { id }
        });

        // Broadcast deletion
        sseManager.broadcast('announcement:deleted', {
            announcementId: id,
            timestamp: getNow().toISOString()
        });

        res.json({ message: 'Announcement deleted' });
    } catch (error) {
        console.error('Delete announcement error:', error);
        res.status(500).json({ error: 'Failed to delete announcement' });
    }
});

export default router;
