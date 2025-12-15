import { AuditAction } from '@prisma/client';
import { sseManager } from '../controllers/sse.controller';
import { getNow, getToday } from './time.service';
import { createAuditLog } from './audit.service';
import { prisma } from '../lib/prisma';

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

            console.log(`[OrderService] Cancelling ${pendingOrders.length} orders for user ${userId}. Reason: ${reason}`);

            // Cancel each order
            for (const order of pendingOrders) {
                await prisma.order.update({
                    where: { id: order.id },
                    data: {
                        status: 'CANCELLED',
                        cancelledBy,
                        cancelReason: reason,
                    },
                });

                // Create notification message for user
                // Even if user is deleted, we record this for audit/history
                await prisma.message.create({
                    data: {
                        orderId: order.id,
                        shiftId: order.shiftId,
                        userId,
                        type: 'CANCELLATION',
                        content: `Pesanan tanggal ${order.orderDate.toLocaleDateString('id-ID')} dibatalkan. Alasan: ${reason}`,
                        orderDate: order.orderDate,
                    },
                });

                // Log audit
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

                result.cancelledCount++;
                result.cancelledOrders.push({
                    orderId: order.id,
                    orderDate: order.orderDate,
                    shiftName: order.shift.name,
                });

                // Broadcast event
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
            // Cutoff date is the LAST allowed date. So we cancel anything GT (greater than) cutoffDate
            // But usually cutoffDate is a Date object set to 00:00:00 of the last valid day
            // So we want to keep orders ON cutoffDate.
            // We cancel orders where orderDate > cutoffDate.
            // Wait, Prisma 'gt' comparison on Dates.
            // If cutoffDate is "2023-12-20 00:00:00", keeping 20th means orderDate < "2023-12-21".
            // Implementation detail: The caller should pass the CORRECT boundary.
            // Let's assume passed cutoffDate is the "Max Valid Date" (inclusive).

            // To be safe: we want to Find Many where orderDate > cutoffDate.
            // But we need to be careful with times. Orders usually store 00:00:00Z.
            // So if cutoffDate is set to T+2 days (00:00:00), we want to keep T+2.
            // We cancel T+3 onwards.
            // So logic: orderDate > cutoffDate.

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

            console.log(`[OrderService] Cancelling ${pendingOrders.length} orders beyond ${cutoffDate.toISOString()}. Reason: ${reason}`);

            for (const order of pendingOrders) {
                await prisma.order.update({
                    where: { id: order.id },
                    data: {
                        status: 'CANCELLED',
                        cancelledBy: 'System (Policy Change)',
                        cancelReason: reason,
                    },
                });

                // Create notification message
                await prisma.message.create({
                    data: {
                        orderId: order.id,
                        shiftId: order.shiftId,
                        userId: order.user.id,
                        type: 'CANCELLATION',
                        content: `Pesanan tanggal ${order.orderDate.toLocaleDateString('id-ID')} dibatalkan karena perubahan kebijakan batas waktu pemesanan.`,
                        orderDate: order.orderDate,
                    },
                });

                // Log audit
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

                result.cancelledCount++;
                result.affectedUsers.add(order.user.name);

                // Broadcast event
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

            return result;
        } catch (error) {
            console.error('[OrderService] Error cancelling orders beyond date:', error);
            throw error;
        }
    }
};
