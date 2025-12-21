/**
 * Order List Routes
 * - GET /my-orders - Get user's orders with pagination
 * - GET /today - Get order for specific date (defaults to today)
 */

import {
    Router,
    Response,
    prisma,
    AuthRequest,
    authMiddleware,
    getToday,
    ErrorMessages,
    OrderWhereFilter,
} from './shared';

const router = Router();

// Get user's orders
router.get('/my-orders', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { status, startDate, endDate, page = '1', limit = '20' } = req.query;

        const where: OrderWhereFilter = { userId: req.user?.id };

        if (status) where.status = status as import('@prisma/client').OrderStatus;
        if (startDate || endDate) {
            where.orderDate = {};
            if (startDate) where.orderDate.gte = new Date(startDate as string);
            if (endDate) where.orderDate.lte = new Date(endDate as string);
        }

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    shift: true,
                    canteen: { select: { id: true, name: true, location: true } }
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
        console.error('Get orders error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Get order for specific date (defaults to today) for current user
router.get('/today', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        let queryDate: Date;

        // Check if date parameter is provided
        if (req.query.date) {
            queryDate = new Date(req.query.date as string);
            if (isNaN(queryDate.getTime())) {
                return res.status(400).json({ error: ErrorMessages.INVALID_ORDER_DATE });
            }
            queryDate.setHours(0, 0, 0, 0);
        } else {
            queryDate = getToday();
        }

        const nextDay = new Date(queryDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const order = await prisma.order.findFirst({
            where: {
                userId: req.user?.id,
                orderDate: {
                    gte: queryDate,
                    lt: nextDay,
                },
                status: { not: 'CANCELLED' },
            },
            include: { shift: true },
        });

        res.json({ order });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

export default router;
