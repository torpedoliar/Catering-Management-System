import { Router, Response } from 'express';
import { AuditAction } from '@prisma/client';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { queryAuditLogs, getAuditStats, cleanupOldLogs, AuditLogQuery } from '../services/audit.service';

const router = Router();

// Get audit logs with filters (Admin only)
router.get('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const {
            page,
            limit,
            userId,
            action,
            entity,
            entityId,
            startDate,
            endDate,
            success,
            search,
        } = req.query;

        const query: AuditLogQuery = {
            page: page ? parseInt(page as string) : 1,
            limit: limit ? parseInt(limit as string) : 50,
        };

        if (userId) query.userId = userId as string;
        if (action) query.action = action as AuditAction;
        if (entity) query.entity = entity as string;
        if (entityId) query.entityId = entityId as string;
        if (startDate) query.startDate = new Date(startDate as string);
        if (endDate) query.endDate = new Date(endDate as string);
        if (success !== undefined) query.success = success === 'true';
        if (search) query.search = search as string;

        const result = await queryAuditLogs(query);
        res.json(result);
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ error: 'Failed to get audit logs' });
    }
});

// Get audit statistics (Admin only)
router.get('/stats', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const days = req.query.days ? parseInt(req.query.days as string) : 7;
        const stats = await getAuditStats(days);
        res.json(stats);
    } catch (error) {
        console.error('Get audit stats error:', error);
        res.status(500).json({ error: 'Failed to get audit statistics' });
    }
});

// Get available actions for filter (Admin only)
router.get('/actions', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const actions = Object.values(AuditAction);
        res.json(actions);
    } catch (error) {
        console.error('Get audit actions error:', error);
        res.status(500).json({ error: 'Failed to get audit actions' });
    }
});

// Get available entities for filter (Admin only)
router.get('/entities', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const entities = [
            'Auth',
            'User',
            'Order',
            'Shift',
            'Blacklist',
            'Settings',
            'Company',
            'Division',
            'Department',
            'Holiday',
            'System',
        ];
        res.json(entities);
    } catch (error) {
        console.error('Get audit entities error:', error);
        res.status(500).json({ error: 'Failed to get audit entities' });
    }
});

// Cleanup old logs (Admin only)
router.post('/cleanup', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const retentionDays = req.body.retentionDays || 90;
        
        if (retentionDays < 7) {
            return res.status(400).json({ error: 'Retention period must be at least 7 days' });
        }

        const deletedCount = await cleanupOldLogs(retentionDays);
        res.json({
            success: true,
            message: `Deleted ${deletedCount} audit logs older than ${retentionDays} days`,
            deletedCount,
        });
    } catch (error) {
        console.error('Cleanup audit logs error:', error);
        res.status(500).json({ error: 'Failed to cleanup audit logs' });
    }
});

export default router;
