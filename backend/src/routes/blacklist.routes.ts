import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { sseManager } from '../controllers/sse.controller';
import { getNow } from '../services/time.service';
import { logBlacklist, getRequestContext } from '../services/audit.service';
import { cancelOrdersForBlacklistedUser } from '../services/noshow.service';
import { ErrorMessages } from '../utils/errorMessages';
import { prisma } from '../lib/prisma';

const router = Router();

// Get all blacklisted users (Admin only)
router.get('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { active = 'true', page = '1', limit = '50' } = req.query;

        const where: any = {};
        if (active === 'true') {
            where.isActive = true;
            where.OR = [
                { endDate: null },
                { endDate: { gt: getNow() } },
            ];
        }

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const [blacklists, total] = await Promise.all([
            prisma.blacklist.findMany({
                where,
                include: {
                    user: {
                        select: { id: true, externalId: true, name: true, company: true, division: true, department: true, noShowCount: true },
                    },
                },
                orderBy: { startDate: 'desc' },
                skip,
                take: parseInt(limit as string),
            }),
            prisma.blacklist.count({ where }),
        ]);

        res.json({
            blacklists,
            pagination: {
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                total,
                totalPages: Math.ceil(total / parseInt(limit as string)),
            },
        });
    } catch (error) {
        console.error('Get blacklist error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Check if current user is blacklisted
router.get('/check', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const blacklist = await prisma.blacklist.findFirst({
            where: {
                userId: req.user?.id,
                isActive: true,
                OR: [
                    { endDate: null },
                    { endDate: { gt: getNow() } },
                ],
            },
        });

        res.json({
            isBlacklisted: !!blacklist,
            blacklist: blacklist || null,
        });
    } catch (error) {
        console.error('Check blacklist error:', error);
        res.status(500).json({ error: 'Failed to check blacklist status' });
    }
});

// Manually blacklist a user (Admin only) - requires password confirmation
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const { userId, reason, durationDays, adminPassword } = req.body;

        // Validate required fields
        if (!userId || !reason) {
            return res.status(400).json({ error: 'User ID and reason are required' });
        }

        if (!adminPassword) {
            return res.status(400).json({ error: 'Admin password confirmation is required' });
        }

        if (reason.trim().length < 10) {
            return res.status(400).json({ error: 'Reason must be at least 10 characters' });
        }

        // Verify admin password
        const admin = await prisma.user.findUnique({ where: { id: req.user?.id } });
        if (!admin) {
            return res.status(401).json({ error: 'Admin user not found' });
        }

        const isPasswordValid = await bcrypt.compare(adminPassword, admin.password);
        if (!isPasswordValid) {
            // Log failed attempt
            await logBlacklist('USER_BLACKLISTED', req.user || null, { id: userId, name: 'Unknown' }, context, {
                metadata: { failedPasswordConfirmation: true, targetUserId: userId },
            });
            return res.status(401).json({ error: 'Invalid admin password' });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent admin from blacklisting themselves
        if (user.id === req.user?.id) {
            return res.status(400).json({ error: 'Cannot blacklist yourself' });
        }

        // Check if already blacklisted
        const existing = await prisma.blacklist.findFirst({
            where: { userId, isActive: true },
        });

        if (existing) {
            return res.status(400).json({ error: 'User is already blacklisted' });
        }

        let endDate: Date | null = null;
        if (durationDays && durationDays > 0) {
            endDate = getNow();
            endDate.setDate(endDate.getDate() + durationDays);
        }

        const blacklist = await prisma.blacklist.create({
            data: {
                userId,
                reason: reason.trim(),
                endDate,
            },
            include: {
                user: { select: { name: true, externalId: true } },
            },
        });

        // Log blacklist action with detailed info
        await logBlacklist('USER_BLACKLISTED', req.user || null, user, context, {
            blacklist,
            metadata: {
                confirmedWithPassword: true,
                durationDays: durationDays || 'Permanent',
                endDate: endDate?.toISOString() || null,
            },
        });

        // Broadcast event
        sseManager.broadcast('user:blacklisted', {
            blacklist,
            timestamp: getNow().toISOString(),
        });

        // Cancel all pending orders for this blacklisted user
        const cancelResult = await cancelOrdersForBlacklistedUser(userId, getNow(), endDate);

        res.status(201).json({
            ...blacklist,
            cancelledOrders: cancelResult.cancelledCount,
            cancelledOrderDetails: cancelResult.cancelledOrders,
        });
    } catch (error) {
        console.error('Create blacklist error:', error);
        res.status(500).json({ error: 'Failed to blacklist user' });
    }
});

// Unblock a user (Admin only) - requires password confirmation
router.post('/:id/unblock', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const { adminPassword, reason } = req.body;

        // Validate required fields
        if (!adminPassword) {
            return res.status(400).json({ error: 'Admin password confirmation is required' });
        }

        if (!reason || reason.trim().length < 10) {
            return res.status(400).json({ error: 'Reason must be at least 10 characters' });
        }

        // Verify admin password
        const admin = await prisma.user.findUnique({ where: { id: req.user?.id } });
        if (!admin) {
            return res.status(401).json({ error: 'Admin user not found' });
        }

        const isPasswordValid = await bcrypt.compare(adminPassword, admin.password);
        if (!isPasswordValid) {
            // Log failed attempt
            await logBlacklist('USER_UNBLOCKED', req.user || null, { id: req.params.id, name: 'Unknown' }, context, {
                metadata: { failedPasswordConfirmation: true, blacklistId: req.params.id },
            });
            return res.status(401).json({ error: 'Invalid admin password' });
        }

        // Get current blacklist record
        const currentBlacklist = await prisma.blacklist.findUnique({
            where: { id: req.params.id },
            include: { user: true },
        });

        if (!currentBlacklist) {
            return res.status(404).json({ error: 'Blacklist record not found' });
        }

        if (!currentBlacklist.isActive) {
            return res.status(400).json({ error: 'User is already unblocked' });
        }

        const blacklist = await prisma.blacklist.update({
            where: { id: req.params.id },
            data: {
                isActive: false,
                endDate: getNow(),
            },
            include: {
                user: { select: { id: true, name: true, externalId: true } },
            },
        });

        // Reset user's no-show count
        await prisma.user.update({
            where: { id: blacklist.userId },
            data: { noShowCount: 0 },
        });

        // Log unblock action with detailed info
        await logBlacklist('USER_UNBLOCKED', req.user || null, blacklist.user, context, {
            blacklist,
            metadata: {
                confirmedWithPassword: true,
                unblockReason: reason.trim(),
                previousBlacklistReason: currentBlacklist.reason,
                previousEndDate: currentBlacklist.endDate?.toISOString() || 'Permanent',
            },
        });

        // Broadcast event
        sseManager.broadcast('user:unblocked', {
            userId: blacklist.userId,
            userName: blacklist.user.name,
            unblockReason: reason.trim(),
            timestamp: getNow().toISOString(),
        });

        res.json({ message: 'User unblocked successfully', blacklist });
    } catch (error) {
        console.error('Unblock error:', error);
        res.status(500).json({ error: 'Failed to unblock user' });
    }
});

// Update blacklist duration (Admin only)
router.put('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { endDate, reason } = req.body;

        const blacklist = await prisma.blacklist.update({
            where: { id: req.params.id },
            data: {
                ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
                ...(reason && { reason }),
            },
            include: {
                user: { select: { name: true, externalId: true } },
            },
        });

        res.json(blacklist);
    } catch (error) {
        console.error('Update blacklist error:', error);
        res.status(500).json({ error: 'Failed to update blacklist' });
    }
});

// Reset user's no-show count (Admin only) - requires password confirmation
router.post('/reset-strikes/:userId', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const { userId } = req.params;
        const { adminPassword, reason, reduceBy } = req.body;

        // Validate required fields
        if (!adminPassword) {
            return res.status(400).json({ error: 'Admin password confirmation is required' });
        }

        if (!reason || reason.trim().length < 5) {
            return res.status(400).json({ error: 'Reason must be at least 5 characters' });
        }

        // Verify admin password
        const admin = await prisma.user.findUnique({ where: { id: req.user?.id } });
        if (!admin) {
            return res.status(401).json({ error: 'Admin user not found' });
        }

        const isPasswordValid = await bcrypt.compare(adminPassword, admin.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid admin password' });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const previousCount = user.noShowCount;
        const newCount = reduceBy
            ? Math.max(0, previousCount - parseInt(reduceBy))
            : 0;

        await prisma.user.update({
            where: { id: userId },
            data: { noShowCount: newCount },
        });

        // Get blacklist threshold from settings
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        const blacklistStrikes = settings?.blacklistStrikes ?? 3;

        // Check if user should be auto-unblocked (if newCount is below threshold)
        let autoUnblocked = false;
        if (newCount < blacklistStrikes) {
            // Check if user is currently blacklisted
            const activeBlacklist = await prisma.blacklist.findFirst({
                where: {
                    userId,
                    isActive: true,
                    OR: [
                        { endDate: null },
                        { endDate: { gt: getNow() } },
                    ],
                },
            });

            if (activeBlacklist) {
                // Auto-unblock the user
                await prisma.blacklist.update({
                    where: { id: activeBlacklist.id },
                    data: {
                        isActive: false,
                        endDate: getNow(),
                    },
                });
                autoUnblocked = true;

                // Log unblock action
                await logBlacklist('USER_UNBLOCKED', req.user || null, user, context, {
                    metadata: {
                        autoUnblock: true,
                        reason: `Auto-unblocked: strikes reduced from ${previousCount} to ${newCount} (below threshold ${blacklistStrikes})`,
                        strikesReductionReason: reason.trim(),
                    },
                });

                // Broadcast unblock event
                sseManager.broadcast('user:unblocked', {
                    userId,
                    userName: user.name,
                    unblockReason: `Auto-unblocked: strikes reduced below threshold`,
                    autoUnblock: true,
                    timestamp: getNow().toISOString(),
                });
            }
        }

        // Log the strikes reset action
        await logBlacklist('STRIKES_RESET', req.user || null, user, context, {
            metadata: {
                previousCount,
                newCount,
                reduceBy: reduceBy || 'all',
                reason: reason.trim(),
                confirmedWithPassword: true,
                autoUnblocked,
            },
        });

        // Broadcast event
        sseManager.broadcast('user:strikes-reset', {
            userId,
            userName: user.name,
            previousCount,
            newCount,
            reason: reason.trim(),
            autoUnblocked,
            timestamp: getNow().toISOString(),
        });

        res.json({
            message: autoUnblocked
                ? `No-show count updated and user auto-unblocked (below threshold ${blacklistStrikes})`
                : 'No-show count updated successfully',
            previousCount,
            newCount,
            autoUnblocked,
            threshold: blacklistStrikes,
        });
    } catch (error) {
        console.error('Reset strikes error:', error);
        res.status(500).json({ error: 'Failed to reset no-show count' });
    }
});

export default router;

