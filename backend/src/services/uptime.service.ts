import os from 'os';
import { prisma } from '../lib/prisma';
import { UptimeEventType } from '@prisma/client';

/**
 * Log server startup event
 */
export async function logServerStart(notes?: string): Promise<void> {
    try {
        await prisma.serverUptimeLog.create({
            data: {
                eventType: 'STARTUP',
                processId: process.pid.toString(),
                hostname: os.hostname(),
                notes: notes || 'Server started'
            }
        });
        console.log('✅ [Uptime] Server start logged');
    } catch (error) {
        console.error('[Uptime] Failed to log start:', error);
    }
}

/**
 * Log server shutdown event
 */
export async function logServerStop(notes?: string): Promise<void> {
    try {
        await prisma.serverUptimeLog.create({
            data: {
                eventType: 'SHUTDOWN',
                processId: process.pid.toString(),
                hostname: os.hostname(),
                notes: notes || 'Server stopped'
            }
        });
        console.log('✅ [Uptime] Server stop logged');
    } catch (error) {
        console.error('[Uptime] Failed to log stop:', error);
    }
}

/**
 * Get uptime history in date range
 */
export async function getUptimeHistory(startDate: Date, endDate: Date) {
    return prisma.serverUptimeLog.findMany({
        where: {
            timestamp: { gte: startDate, lte: endDate }
        },
        orderBy: { timestamp: 'desc' }
    });
}

interface DailyStat {
    date: string;
    dayName: string;
    uptimeMs: number;
    downtimeMs: number;
    restarts: number;
    uptimePercent: number;
}

const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Calculate daily uptime/downtime statistics
 */
export async function calculateDailyStats(startDate: Date, endDate: Date): Promise<DailyStat[]> {
    // Get all events in range plus one before (for calculating previous state)
    const events = await prisma.serverUptimeLog.findMany({
        where: {
            timestamp: { gte: startDate, lte: endDate }
        },
        orderBy: { timestamp: 'asc' }
    });

    // Get the last event before start date to know initial state
    const lastEventBeforeRange = await prisma.serverUptimeLog.findFirst({
        where: {
            timestamp: { lt: startDate }
        },
        orderBy: { timestamp: 'desc' }
    });

    // Initialize daily stats map
    const dailyStats = new Map<string, DailyStat>();
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        dailyStats.set(dateStr, {
            date: dateStr,
            dayName: dayNames[currentDate.getDay()],
            uptimeMs: 0,
            downtimeMs: 0,
            restarts: 0,
            uptimePercent: 0
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // If no events in range, calculate based on last known state
    if (events.length === 0) {
        const wasRunning = lastEventBeforeRange?.eventType === 'STARTUP';
        const totalDayMs = 24 * 60 * 60 * 1000;

        dailyStats.forEach((stat) => {
            if (wasRunning) {
                stat.uptimeMs = totalDayMs;
                stat.uptimePercent = 100;
            } else {
                stat.downtimeMs = totalDayMs;
                stat.uptimePercent = 0;
            }
        });

        return Array.from(dailyStats.values());
    }

    // Process events to calculate uptime/downtime per day
    let wasRunning = lastEventBeforeRange?.eventType === 'STARTUP';
    let lastTimestamp = startDate;

    for (const event of events) {
        const eventDate = event.timestamp;

        // Fill time from last timestamp to this event
        let current = new Date(lastTimestamp);
        while (current < eventDate) {
            const dateStr = current.toISOString().split('T')[0];
            const stat = dailyStats.get(dateStr);

            if (stat) {
                // Calculate end of day or event time, whichever is sooner
                const endOfDay = new Date(current);
                endOfDay.setHours(23, 59, 59, 999);
                const endTime = eventDate < endOfDay ? eventDate : endOfDay;

                const durationMs = endTime.getTime() - current.getTime();

                if (wasRunning) {
                    stat.uptimeMs += durationMs;
                } else {
                    stat.downtimeMs += durationMs;
                }
            }

            // Move to next day or event
            const nextDay = new Date(current);
            nextDay.setDate(nextDay.getDate() + 1);
            nextDay.setHours(0, 0, 0, 0);

            if (nextDay <= eventDate) {
                current = nextDay;
            } else {
                current = eventDate;
            }
        }

        // Process the event
        if (event.eventType === 'STARTUP') {
            const dateStr = eventDate.toISOString().split('T')[0];
            const stat = dailyStats.get(dateStr);
            if (stat) {
                stat.restarts++;
            }
            wasRunning = true;
        } else {
            wasRunning = false;
        }

        lastTimestamp = eventDate;
    }

    // Fill remaining time until end date
    let current = new Date(lastTimestamp);
    while (current <= endDate) {
        const dateStr = current.toISOString().split('T')[0];
        const stat = dailyStats.get(dateStr);

        if (stat) {
            const endOfDay = new Date(current);
            endOfDay.setHours(23, 59, 59, 999);
            const endTime = endDate < endOfDay ? endDate : endOfDay;

            const durationMs = Math.max(0, endTime.getTime() - current.getTime());

            if (wasRunning) {
                stat.uptimeMs += durationMs;
            } else {
                stat.downtimeMs += durationMs;
            }
        }

        const nextDay = new Date(current);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(0, 0, 0, 0);
        current = nextDay;
    }

    // Calculate percentages
    dailyStats.forEach((stat) => {
        const total = stat.uptimeMs + stat.downtimeMs;
        stat.uptimePercent = total > 0 ? Math.round((stat.uptimeMs / total) * 10000) / 100 : 0;
    });

    return Array.from(dailyStats.values());
}

/**
 * Get overall uptime summary
 */
export async function getUptimeSummary(startDate: Date, endDate: Date) {
    const dailyStats = await calculateDailyStats(startDate, endDate);

    const totalUptimeMs = dailyStats.reduce((sum, d) => sum + d.uptimeMs, 0);
    const totalDowntimeMs = dailyStats.reduce((sum, d) => sum + d.downtimeMs, 0);
    const totalRestarts = dailyStats.reduce((sum, d) => sum + d.restarts, 0);
    const totalMs = totalUptimeMs + totalDowntimeMs;
    const uptimePercent = totalMs > 0 ? Math.round((totalUptimeMs / totalMs) * 10000) / 100 : 0;

    return {
        totalUptimeMs,
        totalDowntimeMs,
        totalRestarts,
        uptimePercent,
        daysInRange: dailyStats.length
    };
}

/**
 * Get downtime periods (from SHUTDOWN to next STARTUP)
 */
export async function getDowntimePeriods(startDate: Date, endDate: Date) {
    const events = await prisma.serverUptimeLog.findMany({
        where: {
            timestamp: { gte: startDate, lte: endDate }
        },
        orderBy: { timestamp: 'asc' }
    });

    const downtimePeriods: Array<{
        startTime: Date;
        endTime: Date | null;
        durationMs: number;
    }> = [];

    let shutdownTime: Date | null = null;

    for (const event of events) {
        if (event.eventType === 'SHUTDOWN') {
            shutdownTime = event.timestamp;
        } else if (event.eventType === 'STARTUP' && shutdownTime) {
            downtimePeriods.push({
                startTime: shutdownTime,
                endTime: event.timestamp,
                durationMs: event.timestamp.getTime() - shutdownTime.getTime()
            });
            shutdownTime = null;
        }
    }

    // If still in shutdown state at end of range
    if (shutdownTime) {
        downtimePeriods.push({
            startTime: shutdownTime,
            endTime: null,
            durationMs: endDate.getTime() - shutdownTime.getTime()
        });
    }

    return downtimePeriods;
}
