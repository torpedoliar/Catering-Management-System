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

        // Get current time
        const currentTime = getCurrentTime();
        console.log(`[NoShow Service] Processing no-shows at ${currentTime}`);

        // Find all shifts that have ended today
        const endedShifts = await prisma.shift.findMany({
            where: {
                isActive: true,
            },
        });

        // Filter to only shifts that have ended
        const shiftsEnded = endedShifts.filter(shift => isTimeAfter(currentTime, shift.endTime));

        if (shiftsEnded.length === 0) {
            console.log('[NoShow Service] No shifts have ended yet');
            return result;
        }

        console.log(`[NoShow Service] Found ${shiftsEnded.length} ended shifts`);

        // Find all ORDERED orders for today's ended shifts
        const pendingOrders = await prisma.order.findMany({
            where: {
                orderDate: {
                    gte: today,
                    lt: tomorrow,
                },
                status: 'ORDERED',
                shiftId: {
                    in: shiftsEnded.map(s => s.id),
                },
            },
            include: {
                user: true,
                shift: true,
            },
        });

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
