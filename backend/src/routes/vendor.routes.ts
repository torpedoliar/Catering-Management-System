import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authMiddleware, vendorMiddleware } from '../middleware/auth.middleware';
import { getNow } from '../services/time.service';

const router = Router();

/**
 * Get the ISO week number for a date
 */
function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get start and end dates for a specific week of a year
 */
function getWeekDates(week: number, year: number): { start: Date; end: Date; dates: Date[] } {
    // Find Jan 4th (always in week 1 per ISO)
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7; // Sunday = 7

    // Find Monday of week 1
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - jan4Day + 1);

    // Calculate Monday of the requested week
    const start = new Date(week1Monday);
    start.setDate(week1Monday.getDate() + (week - 1) * 7);
    start.setHours(0, 0, 0, 0);

    // Calculate Sunday of the requested week
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    // Generate all 7 dates
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        dates.push(d);
    }

    return { start, end, dates };
}

const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * GET /api/vendor/weekly-summary
 * Get weekly order summary for vendor dashboard
 */
router.get('/weekly-summary', authMiddleware, vendorMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const now = getNow();
        const currentWeek = getWeekNumber(now);
        const currentYear = now.getFullYear();

        // Parse query params
        const week = parseInt(req.query.week as string) || currentWeek;
        const year = parseInt(req.query.year as string) || currentYear;

        // Get week date range
        const { start, end, dates } = getWeekDates(week, year);

        // Fetch all required data in parallel
        const [shifts, canteens, orders, holidays] = await Promise.all([
            prisma.shift.findMany({
                where: { isActive: true },
                orderBy: { startTime: 'asc' },
                select: { id: true, name: true, startTime: true, endTime: true, mealPrice: true }
            }),
            prisma.canteen.findMany({
                where: { isActive: true },
                orderBy: { name: 'asc' },
                select: { id: true, name: true, location: true }
            }),
            prisma.order.findMany({
                where: {
                    orderDate: { gte: start, lte: end }
                },
                select: {
                    id: true,
                    orderDate: true,
                    shiftId: true,
                    canteenId: true,
                    status: true,
                    shift: { select: { mealPrice: true } }
                }
            }),
            prisma.holiday.findMany({
                where: {
                    date: { gte: start, lte: end },
                    isActive: true
                },
                select: { date: true, name: true, shiftId: true }
            })
        ]);

        // Create holiday map
        const holidayMap: Record<string, string> = {};
        holidays.forEach(h => {
            const dateStr = h.date.toISOString().split('T')[0];
            holidayMap[dateStr] = h.name;
        });

        // Process orders by day
        const dailyData = dates.map(date => {
            const dateStr = date.toISOString().split('T')[0];
            const dayOrders = orders.filter(o =>
                o.orderDate.toISOString().split('T')[0] === dateStr
            );

            // Group by shift
            const byShift: Record<string, { ordered: number; pickedUp: number; noShow: number; cancelled: number }> = {};
            shifts.forEach(s => {
                const shiftOrders = dayOrders.filter(o => o.shiftId === s.id);
                byShift[s.id] = {
                    ordered: shiftOrders.filter(o => o.status !== 'CANCELLED').length,
                    pickedUp: shiftOrders.filter(o => o.status === 'PICKED_UP').length,
                    noShow: shiftOrders.filter(o => o.status === 'NO_SHOW').length,
                    cancelled: shiftOrders.filter(o => o.status === 'CANCELLED').length
                };
            });

            // Group by canteen
            const byCanteen: Record<string, { ordered: number; location: string | null }> = {};
            canteens.forEach(c => {
                const canteenOrders = dayOrders.filter(o => o.canteenId === c.id && o.status !== 'CANCELLED');
                byCanteen[c.id] = {
                    ordered: canteenOrders.length,
                    location: c.location
                };
            });

            // Count without canteen
            const noCanteenOrders = dayOrders.filter(o => !o.canteenId && o.status !== 'CANCELLED');
            if (noCanteenOrders.length > 0) {
                byCanteen['_none'] = {
                    ordered: noCanteenOrders.length,
                    location: null
                };
            }

            // Group by canteen AND shift for detailed breakdown
            const byCanteenShift: Record<string, Record<string, number>> = {};
            canteens.forEach(c => {
                byCanteenShift[c.id] = {};
                shifts.forEach(s => {
                    const count = dayOrders.filter(o =>
                        o.canteenId === c.id &&
                        o.shiftId === s.id &&
                        o.status !== 'CANCELLED'
                    ).length;
                    byCanteenShift[c.id][s.id] = count;
                });
            });

            const total = dayOrders.filter(o => o.status !== 'CANCELLED').length;

            return {
                date: dateStr,
                dayName: dayNames[date.getDay()],
                dayOfWeek: date.getDay(),
                isHoliday: !!holidayMap[dateStr],
                holidayName: holidayMap[dateStr] || null,
                isPast: date < now,
                byShift,
                byCanteen,
                byCanteenShift,
                total
            };
        });

        // Calculate summary
        const allActiveOrders = orders.filter(o => o.status !== 'CANCELLED');
        const totalOrders = allActiveOrders.length;
        const totalPickedUp = orders.filter(o => o.status === 'PICKED_UP').length;
        const totalNoShow = orders.filter(o => o.status === 'NO_SHOW').length;
        const totalCancelled = orders.filter(o => o.status === 'CANCELLED').length;

        // Calculate total cost based on meal prices
        const totalCost = allActiveOrders.reduce((sum, o) => sum + Number(o.shift?.mealPrice || 0), 0);

        res.json({
            week,
            year,
            weekStart: start.toISOString().split('T')[0],
            weekEnd: end.toISOString().split('T')[0],
            shifts: shifts.map(s => ({
                id: s.id,
                name: s.name,
                startTime: s.startTime,
                endTime: s.endTime,
                mealPrice: s.mealPrice
            })),
            canteens: canteens.map(c => ({
                id: c.id,
                name: c.name,
                location: c.location
            })),
            dailyData,
            summary: {
                totalOrders,
                totalPickedUp,
                totalNoShow,
                totalCancelled,
                totalCost,
                avgPerDay: totalOrders > 0 ? Math.round(totalOrders / 7) : 0
            }
        });
    } catch (error) {
        console.error('Vendor weekly summary error:', error);
        res.status(500).json({ error: 'Failed to get weekly summary' });
    }
});

/**
 * GET /api/vendor/available-weeks
 * Get list of available weeks for dropdown
 */
router.get('/available-weeks', authMiddleware, vendorMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const now = getNow();
        const currentWeek = getWeekNumber(now);
        const currentYear = now.getFullYear();

        // Get oldest order date
        const oldestOrder = await prisma.order.findFirst({
            orderBy: { orderDate: 'asc' },
            select: { orderDate: true }
        });

        const weeks: { week: number; year: number; label: string }[] = [];

        // Current week
        weeks.push({
            week: currentWeek,
            year: currentYear,
            label: `Week ${currentWeek} (Saat ini)`
        });

        // Add past weeks (up to 12 weeks back or oldest order)
        let checkDate = new Date(now);
        for (let i = 1; i <= 12; i++) {
            checkDate.setDate(checkDate.getDate() - 7);

            if (oldestOrder && checkDate < oldestOrder.orderDate) break;

            const w = getWeekNumber(checkDate);
            const y = checkDate.getFullYear();

            weeks.push({
                week: w,
                year: y,
                label: `Week ${w}, ${y}`
            });
        }

        res.json({ weeks, currentWeek, currentYear });
    } catch (error) {
        console.error('Available weeks error:', error);
        res.status(500).json({ error: 'Failed to get available weeks' });
    }
});

export default router;
