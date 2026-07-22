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
import { getCachedSettings } from '../../services/cache.service';
import { parseDateToCateringTime } from '../../services/time.service';
import { parseOrderDate, toOrderDateKey } from '../../utils/orderDate';
import { logOrder, logBlacklist, getRequestContext } from '../../services/audit.service';

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

        // T-2: Build the no-show window using Fake-UTC arithmetic. The
        // previous code did `new Date(today.getTime() - 24*60*60*1000)` and
        // `new Date(order.orderDate).setHours(0,0,0,0)` on a real-UTC
        // Prisma Date — both correct only when the configured tz is UTC.
        // In WIB, shift-end times were being compared 7 hours too early.
        // today/tomorrow from getToday()/getTomorrow() are already Fake-UTC
        // midnights. order.orderDate from Prisma is real-UTC; to get a
        // Fake-UTC midnight for the calendar day, slice the ISO date and
        // re-parse via parseDateToCateringTime.
        const yesterday = parseDateToCateringTime(
            toOrderDateKey(new Date(today.getTime() - 24 * 60 * 60 * 1000))
        );

        const pendingOrders = await prisma.order.findMany({
            where: {
                orderDate: { gte: yesterday, lt: tomorrow },
                status: 'ORDERED',
            },
            include: { user: true, shift: true },
        });

        const noShowOrders = pendingOrders.filter(order => {
            // T-2: derive Fake-UTC midnight for the order's catering day.
            const orderDate = parseDateToCateringTime(toOrderDateKey(order.orderDate));

            const [endHours, endMinutes] = order.shift.endTime.split(':').map(Number);
            const [startHours] = order.shift.startTime.split(':').map(Number);

            const shiftEndTime = new Date(orderDate);
            shiftEndTime.setHours(endHours, endMinutes, 0, 0);

            if (endHours < startHours) {
                shiftEndTime.setDate(shiftEndTime.getDate() + 1);
            }

            return now > shiftEndTime;
        });

        const settings = await getCachedSettings();
        const autoBlacklistEnabled = settings?.autoBlacklistEnabled ?? true;
        const strikeThreshold = settings?.blacklistStrikes || 3;
        const blacklistDuration = settings?.blacklistDuration || 7;

        const results = { processed: 0, blacklisted: [] as string[] };

        if (noShowOrders.length === 0) {
            res.json({ message: 'No shows to process', results });
            return;
        }

        // FIX-M3: Group orders by userId for batch processing
        const ordersByUser = new Map<string, typeof noShowOrders>();
        for (const order of noShowOrders) {
            const existing = ordersByUser.get(order.userId) || [];
            existing.push(order);
            ordersByUser.set(order.userId, existing);
        }

        const orderIds = noShowOrders.map(o => o.id);
        const context = getRequestContext(req);

        // FIX-M3: Batch operations in single transaction
        const userUpdates = await prisma.$transaction(async (tx) => {
            // 1. Batch update all orders to NO_SHOW
            await tx.order.updateMany({
                where: { id: { in: orderIds } },
                data: { status: 'NO_SHOW' },
            });

            // 2. Increment noShowCount for each affected user (only if autoBlacklistEnabled is true)
            const updates: Array<{ userId: string; user: any; orderCount: number }> = [];
            for (const [userId, userOrders] of ordersByUser) {
                let updatedUser;
                if (autoBlacklistEnabled) {
                    updatedUser = await tx.user.update({
                        where: { id: userId },
                        data: { noShowCount: { increment: userOrders.length } },
                    });
                } else {
                    updatedUser = await tx.user.findUnique({ where: { id: userId } });
                }
                updates.push({ userId, user: updatedUser, orderCount: userOrders.length });
            }

            return updates;
        });

        // 3. Post-transaction: blacklist checks, audit logs, SSE broadcasts
        for (const { userId, user: updatedUser } of userUpdates) {
            const userOrders = ordersByUser.get(userId)!;

            // Check blacklist threshold (only if autoBlacklistEnabled is true)
            if (autoBlacklistEnabled && updatedUser.noShowCount >= strikeThreshold) {
                const existingBlacklist = await prisma.blacklist.findFirst({
                    where: { userId, isActive: true },
                });

                if (!existingBlacklist) {
                    const endDate = getNow();
                    endDate.setDate(endDate.getDate() + blacklistDuration);

                    const blacklist = await prisma.blacklist.create({
                        data: {
                            userId,
                            reason: `Accumulated ${updatedUser.noShowCount} no-shows`,
                            endDate,
                        },
                    });

                    await logBlacklist('USER_BLACKLISTED', req.user || null, updatedUser, context, {
                        blacklist,
                        previousStrikes: updatedUser.noShowCount - userOrders.length,
                        metadata: { source: 'process-noshows' },
                    });

                    results.blacklisted.push(updatedUser.externalId);

                    sseManager.broadcast('user:blacklisted', {
                        userId,
                        userName: updatedUser.name,
                        noShowCount: updatedUser.noShowCount,
                        timestamp: getNow().toISOString(),
                    });
                }
            }

            // Audit log + SSE broadcast per order
            for (const order of userOrders) {
                await logOrder('ORDER_NOSHOW', req.user || null, { ...order, status: 'NO_SHOW' }, context);
                results.processed++;

                sseManager.broadcast('order:noshow', {
                    orderId: order.id,
                    userId,
                    userName: order.user.name,
                    noShowCount: updatedUser.noShowCount,
                    timestamp: getNow().toISOString(),
                });
            }
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
