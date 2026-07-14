import { AuditAction } from '@prisma/client';
import { sseManager } from '../controllers/sse.controller';
import { getNow, getToday } from './time.service';
import { createAuditLog } from './audit.service';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Thrown by createOrderWithCapacityCheck when a canteen's per-shift or
 * daily capacity has been reached. Callers should catch this and return
 * HTTP 409 to the client.
 *
 * Audit ref: C-R1 (HIGH — TOCTOU race on capacity check).
 */
export class CapacityError extends Error {
    constructor(
        public readonly limit: number,
        public readonly isShiftSpecific: boolean
    ) {
        super(`Canteen capacity ${limit} reached`);
        this.name = 'CapacityError';
    }
}

/**
 * Create an order inside a SERIALIZABLE transaction with capacity check.
 *
 * The classic TOCTOU race in the order create path: a `count` followed by
 * a `create` lets two concurrent requests for the last capacity slot both
 * pass the check and both create orders, overbooking the canteen by 1.
 *
 * This helper wraps the count + create in a `prisma.$transaction` with
 * `Serializable` isolation. If the count returns >= limit, throws
 * CapacityError. Caller catches and returns 409.
 *
 * @param tx Prisma transaction client
 * @param canteenId canteen for the order
 * @param shiftId shift for the order
 * @param orderDate catering date (Fake-UTC midnight)
 * @param orderData the order create payload
 * @returns created Order
 * @throws CapacityError if the canteen is full
 */
export async function createOrderWithCapacityCheck(
    tx: Prisma.TransactionClient,
    canteenId: string | null,
    shiftId: string,
    orderDate: Date,
    orderData: Omit<Prisma.OrderCreateInput, 'canteen' | 'shift' | 'orderDate'>
): Promise<any> {
    if (!canteenId) {
        // No canteenId → no capacity constraint, just create
        return await tx.order.create({ data: { ...orderData, orderDate } as any });
    }

    const canteen = await tx.canteen.findUnique({
        where: { id: canteenId },
        include: { canteenShifts: { where: { shiftId } } },
    });

    if (!canteen || !canteen.isActive) {
        throw new Error('Kantin tidak ditemukan atau tidak aktif');
    }

    const canteenShift = canteen.canteenShifts[0];
    let limit = 0;
    let isShiftSpecific = false;

    if (canteenShift && canteenShift.capacity) {
        limit = canteenShift.capacity;
        isShiftSpecific = true;
    } else if (canteen.capacity) {
        limit = canteen.capacity;
    } else {
        // No limit set — fall through to create
        return await tx.order.create({ data: { ...orderData, orderDate } as any });
    }

    const nextDay = new Date(orderDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const where: Prisma.OrderWhereInput = {
        canteenId,
        orderDate: { gte: orderDate, lt: nextDay },
        status: { not: 'CANCELLED' },
    };
    if (isShiftSpecific) {
        where.shiftId = shiftId;
    }

    const currentCount = await tx.order.count({ where });

    if (currentCount >= limit) {
        throw new CapacityError(limit, isShiftSpecific);
    }

    return await tx.order.create({ data: { ...orderData, orderDate } as any });
}

/**
 * Service to handle complex order operations
 */
export const OrderService = {
    /**
     * Cancel all pending orders for a specific user
     * @param userId The ID of the user
     * @param reason The reason for cancellation
     * @param cancelledBy Who cancelled the orders (default: 'System')
     */
    async cancelUserOrders(userId: string, reason: string, cancelledBy: string = 'System') {
        const result = {
            cancelledCount: 0,
            cancelledOrders: [] as any[],
        };

        try {
            const today = getToday();

            // Find all pending orders (ORDERED status) for this user from today onwards
            const pendingOrders = await prisma.order.findMany({
                where: {
                    userId,
                    status: 'ORDERED',
                    orderDate: { gte: today },
                },
                include: {
                    shift: true,
                    user: { select: { name: true, externalId: true, email: true } },
                },
            });

            if (pendingOrders.length === 0) {
                return result;
            }

            const orderIds = pendingOrders.map(o => o.id);

            // FIX-M4: Batch cancel in single transaction
            await prisma.$transaction(async (tx) => {
                // 1. Batch update all orders to CANCELLED
                await tx.order.updateMany({
                    where: { id: { in: orderIds } },
                    data: { status: 'CANCELLED', cancelledBy, cancelReason: reason },
                });

                // 2. Batch create notification messages
                await tx.message.createMany({
                    data: pendingOrders.map(order => ({
                        orderId: order.id,
                        shiftId: order.shiftId,
                        userId,
                        type: 'CANCELLATION' as const,
                        content: `Pesanan tanggal ${order.orderDate.toLocaleDateString('id-ID')} dibatalkan. Alasan: ${reason}`,
                        orderDate: order.orderDate,
                    })),
                });
            });

            // 3. Post-transaction: audit logs + SSE broadcasts (fire-and-forget)
            for (const order of pendingOrders) {
                await createAuditLog(null, {
                    action: AuditAction.ORDER_CANCELLED,
                    entity: 'Order',
                    entityId: order.id,
                    entityName: `Order #${order.id.slice(-8)}`,
                    oldValue: { status: 'ORDERED' },
                    newValue: { status: 'CANCELLED' },
                    description: `Order auto-cancelled: ${reason}`,
                    metadata: {
                        userId,
                        userName: order.user.name,
                        shiftName: order.shift.name,
                        orderDate: order.orderDate.toISOString(),
                        reason,
                        cancelledBy,
                    },
                });

                result.cancelledOrders.push({
                    orderId: order.id,
                    orderDate: order.orderDate,
                    shiftName: order.shift.name,
                });

                sseManager.broadcast('order:cancelled', {
                    orderId: order.id,
                    userId,
                    userName: order.user.name,
                    shiftName: order.shift.name,
                    reason,
                    cancelledBy,
                    timestamp: getNow().toISOString(),
                });
            }

            result.cancelledCount = pendingOrders.length;
            return result;
        } catch (error) {
            console.error('[OrderService] Error cancelling user orders:', error);
            throw error;
        }
    },

    /**
     * Cancel all orders strictly AFTER a specific date
     * Used when maxOrderDaysAhead setting is reduced
     * @param cutoffDate The last valid date allowed (orders AFTER this date will be cancelled)
     * @param reason The reason for cancellation
     */
    async cancelOrdersBeyondDate(cutoffDate: Date, reason: string) {
        const result = {
            cancelledCount: 0,
            affectedUsers: new Set<string>(),
        };

        try {
            const pendingOrders = await prisma.order.findMany({
                where: {
                    status: 'ORDERED',
                    orderDate: { gt: cutoffDate },
                },
                include: {
                    shift: true,
                    user: { select: { id: true, name: true, externalId: true } },
                },
            });

            if (pendingOrders.length === 0) {
                return result;
            }

            const orderIds = pendingOrders.map(o => o.id);

            // FIX-M4: Batch cancel in single transaction
            await prisma.$transaction(async (tx) => {
                await tx.order.updateMany({
                    where: { id: { in: orderIds } },
                    data: {
                        status: 'CANCELLED',
                        cancelledBy: 'System (Policy Change)',
                        cancelReason: reason,
                    },
                });

                await tx.message.createMany({
                    data: pendingOrders.map(order => ({
                        orderId: order.id,
                        shiftId: order.shiftId,
                        userId: order.user.id,
                        type: 'CANCELLATION' as const,
                        content: `Pesanan tanggal ${order.orderDate.toLocaleDateString('id-ID')} dibatalkan karena perubahan kebijakan batas waktu pemesanan.`,
                        orderDate: order.orderDate,
                    })),
                });
            });

            // Post-transaction: audit logs + SSE broadcasts
            for (const order of pendingOrders) {
                await createAuditLog(null, {
                    action: AuditAction.ORDER_CANCELLED,
                    entity: 'Order',
                    entityId: order.id,
                    entityName: `Order #${order.id.slice(-8)}`,
                    oldValue: { status: 'ORDERED' },
                    newValue: { status: 'CANCELLED' },
                    description: `Order auto-cancelled (Policy Change): ${reason}`,
                    metadata: {
                        userId: order.user.id,
                        userName: order.user.name,
                        shiftName: order.shift.name,
                        orderDate: order.orderDate.toISOString(),
                        reason,
                    },
                });

                result.affectedUsers.add(order.user.name);

                sseManager.broadcast('order:cancelled', {
                    orderId: order.id,
                    userId: order.user.id,
                    userName: order.user.name,
                    shiftName: order.shift.name,
                    reason,
                    cancelledBy: 'System (Policy Change)',
                    timestamp: getNow().toISOString(),
                });
            }

            result.cancelledCount = pendingOrders.length;
            return result;
        } catch (error) {
            console.error('[OrderService] Error cancelling orders beyond date:', error);
            throw error;
        }
    },

    /**
     * Validate canteen capacity for a specific date and shift
     */
    async validateCanteenCapacity(canteenId: string | null, shiftId: string, orderDate: Date) {
        if (!canteenId) return { valid: true };

        // 1. Get Canteen and CanteenShift settings
        const canteen = await prisma.canteen.findUnique({
            where: { id: canteenId },
            include: {
                canteenShifts: {
                    where: { shiftId }
                }
            }
        });

        if (!canteen || !canteen.isActive) {
            return { valid: false, message: 'Kantin tidak ditemukan atau tidak aktif' };
        }

        const canteenShift = canteen.canteenShifts[0]; // Specific shift setting

        // 2. Determine Capacity Limit
        let limit = 0;
        let isShiftSpecific = false;

        if (canteenShift && canteenShift.capacity) {
            limit = canteenShift.capacity;
            isShiftSpecific = true;
        } else if (canteen.capacity) {
            limit = canteen.capacity;
        } else {
            return { valid: true }; // No limit set
        }

        // 3. Count existing orders
        const nextDay = new Date(orderDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const where: any = {
            canteenId,
            orderDate: { gte: orderDate, lt: nextDay },
            status: { not: 'CANCELLED' }
        };

        if (isShiftSpecific) {
            where.shiftId = shiftId;
        }

        const currentCount = await prisma.order.count({ where });

        if (currentCount >= limit) {
            return {
                valid: false,
                message: isShiftSpecific
                    ? `KKuota kantin ${canteen.name} untuk shift ini penuh (${limit} porsi)`
                    : `Kuota harian kantin ${canteen.name} penuh (${limit} porsi)`
            };
        }

        return { valid: true };
    }
};
