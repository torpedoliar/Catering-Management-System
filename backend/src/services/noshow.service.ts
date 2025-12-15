import { PrismaClient, AuditAction } from '@prisma/client';
import { sseManager } from '../controllers/sse.controller';
import { getNow, getToday, getTomorrow } from './time.service';
import { createAuditLog } from './audit.service';

const prisma = new PrismaClient();

interface NoShowResult {
    processedOrders: number;
    newBlacklists: number;
    affectedUsers: string[];
}

/**
 * Get the current time in HH:mm format
 */
function getCurrentTime(): string {
    const now = getNow();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * Compare two time strings (HH:mm format)
 * Returns true if time1 is after time2
 */
function isTimeAfter(time1: string, time2: string): boolean {
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);
    return h1 > h2 || (h1 === h2 && m1 > m2);
}

/**
 * Check if a shift is an overnight shift (ends the next day)
 * e.g., 23:00 - 07:00 is overnight because endTime < startTime
 */
function isOvernightShift(startTime: string, endTime: string): boolean {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    // If end time is before or equal to start time, it's overnight
    return endH < startH || (endH === startH && endM <= startM);
}

/**
 * Check if an overnight shift has ended
 * For overnight shifts (e.g., 23:00-07:00):
 * - The shift starts today and ends tomorrow
 * - We should only mark as no-show AFTER the shift ends tomorrow
 * - So on the order date, we should NOT mark as no-show (shift hasn't even started/ended)
 */
function hasShiftEnded(shift: { startTime: string; endTime: string }, currentTime: string): boolean {
    const isOvernight = isOvernightShift(shift.startTime, shift.endTime);

    if (isOvernight) {
        // For overnight shifts, we should NEVER mark as no-show on the same day as orderDate
        // because the shift ends on the NEXT day
        return false;
    }

    // For regular daytime shifts, just check if current time is after end time
    return isTimeAfter(currentTime, shift.endTime);
}

/**
 * Process all no-show orders for shifts that have ended
 * This should be called periodically (e.g., every hour via cron)
 */
export async function processNoShows(): Promise<NoShowResult> {
    const result: NoShowResult = {
        processedOrders: 0,
        newBlacklists: 0,
        affectedUsers: [],
    };

    try {
        // Get today's date range
        const today = getToday();
        const tomorrow = getTomorrow();

        // Also get yesterday for overnight shifts that ended today
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        // Get current time
        const currentTime = getCurrentTime();
        console.log(`[NoShow Service] Processing no-shows at ${currentTime}`);

        // Find all shifts that have ended today
        const allShifts = await prisma.shift.findMany({
            where: {
                isActive: true,
            },
        });

        // Filter to only daytime shifts that have ended today
        const daytimeShiftsEnded = allShifts.filter(shift => hasShiftEnded(shift, currentTime));

        // Filter overnight shifts that ended today (orders from yesterday)
        const overnightShiftsThatEndedToday = allShifts.filter(shift => {
            const isOvernight = isOvernightShift(shift.startTime, shift.endTime);
            if (!isOvernight) return false;
            // Check if current time is after the end time (the shift ended today)
            return isTimeAfter(currentTime, shift.endTime);
        });

        console.log(`[NoShow Service] Found ${daytimeShiftsEnded.length} daytime shifts ended, ${overnightShiftsThatEndedToday.length} overnight shifts ended`);

        // Find all ORDERED orders for today's ended daytime shifts
        const pendingDaytimeOrders = daytimeShiftsEnded.length > 0 ? await prisma.order.findMany({
            where: {
                orderDate: {
                    gte: today,
                    lt: tomorrow,
                },
                status: 'ORDERED',
                shiftId: {
                    in: daytimeShiftsEnded.map(s => s.id),
                },
            },
            include: {
                user: true,
                shift: true,
            },
        }) : [];

        // Find all ORDERED orders for yesterday's overnight shifts (that ended today)
        const pendingOvernightOrders = overnightShiftsThatEndedToday.length > 0 ? await prisma.order.findMany({
            where: {
                orderDate: {
                    gte: yesterday,
                    lt: today,
                },
                status: 'ORDERED',
                shiftId: {
                    in: overnightShiftsThatEndedToday.map(s => s.id),
                },
            },
            include: {
                user: true,
                shift: true,
            },
        }) : [];

        const pendingOrders = [...pendingDaytimeOrders, ...pendingOvernightOrders];

        if (pendingOrders.length === 0) {
            console.log('[NoShow Service] No pending orders to process');
            return result;
        }

        console.log(`[NoShow Service] Found ${pendingOrders.length} unclaimed orders`);

        // Get settings
        const settings = await prisma.settings.findFirst();
        const blacklistStrikes = settings?.blacklistStrikes ?? 3;
        const blacklistDuration = settings?.blacklistDuration ?? 7;

        // Process each order
        for (const order of pendingOrders) {
            // Mark order as NO_SHOW
            const updatedOrder = await prisma.order.update({
                where: { id: order.id },
                data: { status: 'NO_SHOW' },
                include: { shift: true },
            });

            result.processedOrders++;

            // Log audit for no-show
            await createAuditLog(null, {
                action: AuditAction.ORDER_NOSHOW,
                entity: 'Order',
                entityId: order.id,
                entityName: `Order #${order.id.slice(-8)}`,
                oldValue: { status: 'ORDERED' },
                newValue: { status: 'NO_SHOW' },
                description: `Order marked as no-show (auto-processed) for ${updatedOrder.shift.name}`,
                metadata: {
                    userId: order.userId,
                    userName: order.user.name,
                    shiftId: order.shiftId,
                    shiftName: order.shift.name,
                    processedBy: 'System Scheduler',
                },
            });

            // Increment user's no-show count
            const updatedUser = await prisma.user.update({
                where: { id: order.userId },
                data: { noShowCount: { increment: 1 } },
            });

            if (!result.affectedUsers.includes(updatedUser.name)) {
                result.affectedUsers.push(updatedUser.name);
            }

            console.log(`[NoShow Service] User ${updatedUser.name} now has ${updatedUser.noShowCount} no-shows`);

            // Check if user should be blacklisted
            if (updatedUser.noShowCount >= blacklistStrikes) {
                // Check if already blacklisted
                const existingBlacklist = await prisma.blacklist.findFirst({
                    where: {
                        userId: updatedUser.id,
                        isActive: true,
                        OR: [
                            { endDate: null },
                            { endDate: { gt: getNow() } },
                        ],
                    },
                });

                if (!existingBlacklist) {
                    // Create blacklist entry
                    const endDate = getNow();
                    endDate.setDate(endDate.getDate() + blacklistDuration);

                    const blacklist = await prisma.blacklist.create({
                        data: {
                            userId: updatedUser.id,
                            reason: `Automatic blacklist: ${updatedUser.noShowCount} no-shows (threshold: ${blacklistStrikes})`,
                            endDate,
                        },
                        include: {
                            user: { select: { name: true, externalId: true } },
                        },
                    });

                    result.newBlacklists++;

                    // Log audit for auto-blacklist
                    await createAuditLog(null, {
                        action: AuditAction.USER_BLACKLISTED,
                        entity: 'Blacklist',
                        entityId: blacklist.id,
                        entityName: updatedUser.name,
                        description: `User ${updatedUser.name} auto-blacklisted after ${updatedUser.noShowCount} no-shows`,
                        metadata: {
                            userId: updatedUser.id,
                            userName: updatedUser.name,
                            noShowCount: updatedUser.noShowCount,
                            threshold: blacklistStrikes,
                            endDate: endDate.toISOString(),
                            processedBy: 'System Scheduler',
                        },
                    });

                    console.log(`[NoShow Service] User ${updatedUser.name} has been blacklisted until ${endDate.toLocaleDateString()}`);

                    // Broadcast blacklist event
                    sseManager.broadcast('user:blacklisted', {
                        blacklist,
                        timestamp: getNow().toISOString(),
                        reason: 'auto_noshow',
                    });

                    // Cancel all pending orders for this blacklisted user
                    await cancelOrdersForBlacklistedUser(updatedUser.id, getNow(), endDate);
                }
            }

            // Broadcast no-show event
            sseManager.broadcast('order:noshow', {
                orderId: order.id,
                userId: order.userId,
                userName: order.user.name,
                shiftName: order.shift.name,
                noShowCount: updatedUser.noShowCount,
                timestamp: getNow().toISOString(),
            });
        }

        console.log(`[NoShow Service] Completed: ${result.processedOrders} orders marked as no-show, ${result.newBlacklists} new blacklists`);

        return result;
    } catch (error) {
        console.error('[NoShow Service] Error processing no-shows:', error);
        throw error;
    }
}

/**
 * Reset a user's no-show count (admin action)
 */
export async function resetNoShowCount(userId: string): Promise<void> {
    await prisma.user.update({
        where: { id: userId },
        data: { noShowCount: 0 },
    });
    console.log(`[NoShow Service] Reset no-show count for user ${userId}`);
}

/**
 * Get no-show statistics for today
 */
export async function getNoShowStats() {
    const today = getToday();
    const tomorrow = getTomorrow();

    const [totalOrders, pickedUp, noShows, pending] = await Promise.all([
        prisma.order.count({
            where: { orderDate: { gte: today, lt: tomorrow } },
        }),
        prisma.order.count({
            where: { orderDate: { gte: today, lt: tomorrow }, status: 'PICKED_UP' },
        }),
        prisma.order.count({
            where: { orderDate: { gte: today, lt: tomorrow }, status: 'NO_SHOW' },
        }),
        prisma.order.count({
            where: { orderDate: { gte: today, lt: tomorrow }, status: 'ORDERED' },
        }),
    ]);

    return {
        totalOrders,
        pickedUp,
        noShows,
        pending,
        pickupRate: totalOrders > 0 ? Math.round((pickedUp / totalOrders) * 100) : 0,
    };
}

/**
 * Cancel all pending orders for a user who has been blacklisted
 * This should be called whenever a user is blacklisted (auto or manual)
 */
export async function cancelOrdersForBlacklistedUser(
    userId: string,
    blacklistDate: Date,
    blacklistEndDate: Date | null
): Promise<{ cancelledCount: number; cancelledOrders: any[] }> {
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
                user: { select: { name: true, externalId: true } },
            },
        });

        if (pendingOrders.length === 0) {
            console.log(`[NoShow Service] No pending orders to cancel for user ${userId}`);
            return result;
        }

        // Format blacklist date for the cancel reason
        const blacklistDateStr = blacklistDate.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
        const blacklistEndStr = blacklistEndDate
            ? blacklistEndDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
            : 'Permanen';

        const cancelReason = `Pesanan dibatalkan otomatis karena user di-blacklist pada ${blacklistDateStr} (berakhir: ${blacklistEndStr})`;

        // Cancel each order
        for (const order of pendingOrders) {
            const updatedOrder = await prisma.order.update({
                where: { id: order.id },
                data: {
                    status: 'CANCELLED',
                    cancelledBy: 'System (Blacklist)',
                    cancelReason,
                },
                include: { shift: true },
            });

            // Create a cancellation message
            await prisma.message.create({
                data: {
                    orderId: order.id,
                    shiftId: order.shiftId,
                    userId,
                    type: 'CANCELLATION',
                    content: cancelReason,
                    orderDate: order.orderDate,
                },
            });

            // Log audit for auto-cancel
            await createAuditLog(null, {
                action: AuditAction.ORDER_CANCELLED,
                entity: 'Order',
                entityId: order.id,
                entityName: `Order #${order.id.slice(-8)}`,
                oldValue: { status: 'ORDERED' },
                newValue: { status: 'CANCELLED' },
                description: `Order auto-cancelled due to user blacklist`,
                metadata: {
                    userId,
                    userName: order.user.name,
                    shiftName: order.shift.name,
                    orderDate: order.orderDate.toISOString(),
                    blacklistDate: blacklistDateStr,
                    blacklistEndDate: blacklistEndStr,
                    cancelledBy: 'System (Blacklist)',
                },
            });

            result.cancelledCount++;
            result.cancelledOrders.push({
                orderId: order.id,
                orderDate: order.orderDate,
                shiftName: order.shift.name,
            });

            // Broadcast order cancelled event
            sseManager.broadcast('order:cancelled', {
                orderId: order.id,
                userId,
                userName: order.user.name,
                shiftName: order.shift.name,
                reason: cancelReason,
                cancelledBy: 'System (Blacklist)',
                timestamp: getNow().toISOString(),
            });
        }

        console.log(`[NoShow Service] Cancelled ${result.cancelledCount} orders for blacklisted user ${userId}`);

        return result;
    } catch (error) {
        console.error('[NoShow Service] Error cancelling orders for blacklisted user:', error);
        throw error;
    }
}
