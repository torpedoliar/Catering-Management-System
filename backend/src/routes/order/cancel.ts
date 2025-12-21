/**
 * Order Cancellation Route
 * - POST /:id/cancel - Cancel an order
 */

import {
    Router,
    Response,
    prisma,
    AuthRequest,
    authMiddleware,
    sseManager,
    getNow,
    isDateOrderableWeekly,
    isPastCutoffForDate,
    logOrder,
    getRequestContext,
    ErrorMessages,
} from './shared';

const router = Router();

// Cancel order
router.post('/:id/cancel', authMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: { shift: true },
        });

        if (!order) {
            return res.status(404).json({ error: ErrorMessages.ORDER_NOT_FOUND });
        }

        if (order.userId !== req.user?.id && req.user?.role === 'USER') {
            return res.status(403).json({ error: ErrorMessages.FORBIDDEN });
        }

        if (order.status !== 'ORDERED') {
            return res.status(400).json({ error: ErrorMessages.CANNOT_CANCEL_PICKED_UP });
        }

        // Check cutoff time
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        const cutoffMode = settings?.cutoffMode || 'per-shift';
        const cutoffDays = settings?.cutoffDays || 0;
        const cutoffHours = settings?.cutoffHours || 6;

        let canCancel = true;
        let cancelBlockReason = '';

        if (cutoffMode === 'weekly') {
            const weeklyCheck = isDateOrderableWeekly(order.orderDate, {
                weeklyCutoffDay: settings?.weeklyCutoffDay || 5,
                weeklyCutoffHour: settings?.weeklyCutoffHour || 17,
                weeklyCutoffMinute: settings?.weeklyCutoffMinute || 0,
                orderableDays: settings?.orderableDays || '1,2,3,4,5,6',
                maxWeeksAhead: settings?.maxWeeksAhead || 1,
            });
            canCancel = weeklyCheck.canOrder;
            cancelBlockReason = weeklyCheck.reason || 'Cutoff mingguan sudah lewat';
        } else {
            const cutoffInfo = isPastCutoffForDate(order.orderDate, order.shift.startTime, cutoffDays, cutoffHours);
            canCancel = !cutoffInfo.isPast;
            cancelBlockReason = `Cutoff untuk shift ${order.shift.name} sudah lewat`;
        }

        if (!canCancel) {
            return res.status(400).json({
                error: ErrorMessages.CANNOT_CANCEL_PAST_CUTOFF,
                message: cancelBlockReason,
                canCancel: false
            });
        }

        const cancelledByUser = req.user ? await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, externalId: true }
        }) : null;

        const cancelReason = req.body.reason || (req.user?.role === 'USER' ? 'Dibatalkan oleh user' : 'Dibatalkan oleh admin');

        const updatedOrder = await prisma.order.update({
            where: { id: order.id },
            data: {
                status: 'CANCELLED',
                cancelledById: cancelledByUser?.id || null,
                cancelledBy: cancelledByUser?.name || 'System',
                cancelReason: cancelReason,
            },
            include: {
                user: { select: { id: true, name: true, externalId: true } },
                shift: true,
            },
        });

        await logOrder('ORDER_CANCELLED', req.user || null, updatedOrder, context, {
            oldValue: { status: order.status },
            metadata: { cancelledBy: cancelledByUser?.name, cancelReason },
        });

        await prisma.message.create({
            data: {
                orderId: order.id,
                shiftId: order.shiftId,
                userId: req.user?.id || order.userId,
                type: 'CANCELLATION',
                content: cancelReason,
                orderDate: order.orderDate,
            },
        });

        sseManager.broadcast('order:cancelled', {
            order: updatedOrder,
            timestamp: getNow().toISOString(),
        });

        res.json({ message: 'Order cancelled', order: updatedOrder });
    } catch (error) {
        console.error('Cancel order error:', error);
        res.status(500).json({ error: 'Failed to cancel order' });
    }
});

export default router;
