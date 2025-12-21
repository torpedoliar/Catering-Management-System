/**
 * Admin Order Routes
 * - GET / - Get all orders (Admin only)
 * - POST /process-noshows - Process no-shows (Admin only)
 */

import {
    Router,
    Response,
    prisma,
    AuthRequest,
    authMiddleware,
    adminMiddleware,
    sseManager,
    getNow,
    getToday,
    getTomorrow,
} from './shared';

const router = Router();

// Get all orders (Admin only)
router.get('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { status, shiftId, startDate, endDate, search, page = '1', limit = '50' } = req.query;

        const where: any = {};

        if (status) where.status = status;
        if (shiftId) where.shiftId = shiftId;
        if (startDate || endDate) {
            where.orderDate = {};
            if (startDate) where.orderDate.gte = new Date(startDate as string);
            if (endDate) where.orderDate.lte = new Date(endDate as string);
        }
        if (search) {
            where.user = {
                OR: [
                    { name: { contains: search as string, mode: 'insensitive' } },
                    { externalId: { contains: search as string, mode: 'insensitive' } },
                ],
            };
        }

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true } },
                    shift: true,
                    canteen: { select: { id: true, name: true, location: true } },
                },
                orderBy: { orderDate: 'desc' },
                skip,
                take: parseInt(limit as string),
            }),
            prisma.order.count({ where }),
        ]);

        res.json({
            orders,
            pagination: {
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                total,
                totalPages: Math.ceil(total / parseInt(limit as string)),
            },
        });
    } catch (error) {
        console.error('Get all orders error:', error);
        res.status(500).json({ error: 'Failed to get orders' });
    }
});

// Process no-shows (Admin only)
router.post('/process-noshows', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const now = getNow();
        const today = getToday();
        const tomorrow = getTomorrow();

        const pendingOrders = await prisma.order.findMany({
            where: {
                orderDate: { gte: new Date(today.getTime() - 24 * 60 * 60 * 1000), lt: tomorrow },
                status: 'ORDERED',
            },
            include: { user: true, shift: true },
        });

        const noShowOrders = pendingOrders.filter(order => {
            const orderDate = new Date(order.orderDate);
            orderDate.setHours(0, 0, 0, 0);

            const [endHours, endMinutes] = order.shift.endTime.split(':').map(Number);
            const [startHours] = order.shift.startTime.split(':').map(Number);

            let shiftEndTime = new Date(orderDate);
            shiftEndTime.setHours(endHours, endMinutes, 0, 0);

            if (endHours < startHours) {
                shiftEndTime.setDate(shiftEndTime.getDate() + 1);
            }

            return now > shiftEndTime;
        });

        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        const strikeThreshold = settings?.blacklistStrikes || 3;
        const blacklistDuration = settings?.blacklistDuration || 7;

        const results = { processed: 0, blacklisted: [] as string[] };

        for (const order of noShowOrders) {
            await prisma.order.update({
                where: { id: order.id },
                data: { status: 'NO_SHOW' },
            });

            const updatedUser = await prisma.user.update({
                where: { id: order.userId },
                data: { noShowCount: { increment: 1 } },
            });

            results.processed++;

            if (updatedUser.noShowCount >= strikeThreshold) {
                const existingBlacklist = await prisma.blacklist.findFirst({
                    where: { userId: order.userId, isActive: true },
                });

                if (!existingBlacklist) {
                    const endDate = getNow();
                    endDate.setDate(endDate.getDate() + blacklistDuration);

                    await prisma.blacklist.create({
                        data: {
                            userId: order.userId,
                            reason: `Accumulated ${updatedUser.noShowCount} no-shows`,
                            endDate,
                        },
                    });

                    results.blacklisted.push(updatedUser.externalId);

                    sseManager.broadcast('user:blacklisted', {
                        userId: order.userId,
                        userName: updatedUser.name,
                        noShowCount: updatedUser.noShowCount,
                        timestamp: getNow().toISOString(),
                    });
                }
            }

            sseManager.broadcast('order:noshow', {
                orderId: order.id,
                userId: order.userId,
                userName: order.user.name,
                noShowCount: order.user.noShowCount + 1,
                timestamp: getNow().toISOString(),
            });
        }

        res.json({
            message: `Processed ${results.processed} no-shows`,
            results,
        });
    } catch (error) {
        console.error('Process no-shows error:', error);
        res.status(500).json({ error: 'Failed to process no-shows' });
    }
});

export default router;
