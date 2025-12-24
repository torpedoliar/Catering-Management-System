import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { sseManager } from '../controllers/sse.controller';
import { getNow } from '../services/time.service';

const router = Router();

const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Get US week number for a date (Sunday = first day)
 */
function getWeekNumber(date: Date): number {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const jan1Day = jan1.getDay();
    const week1Start = new Date(jan1);
    week1Start.setDate(jan1.getDate() - jan1Day);
    const diffDays = Math.floor((d.getTime() - week1Start.getTime()) / 86400000);
    return Math.floor(diffDays / 7) + 1;
}

/**
 * Get week dates (Sunday to Saturday)
 */
function getWeekDates(week: number, year: number): { start: Date; end: Date; dates: Date[] } {
    const jan1 = new Date(year, 0, 1);
    const jan1Day = jan1.getDay();
    const week1Sunday = new Date(jan1);
    week1Sunday.setDate(jan1.getDate() - jan1Day);

    const start = new Date(week1Sunday);
    start.setDate(week1Sunday.getDate() + (week - 1) * 7);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        dates.push(d);
    }

    return { start, end, dates };
}

/**
 * GET /api/weekly-menu
 * Get weekly menu for a specific week
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const now = getNow();
        const currentWeek = getWeekNumber(now);
        const currentYear = now.getFullYear();

        const week = parseInt(req.query.week as string) || currentWeek;
        const year = parseInt(req.query.year as string) || currentYear;

        const { start, end, dates } = getWeekDates(week, year);

        // Get shifts
        const shifts = await prisma.shift.findMany({
            where: { isActive: true },
            orderBy: { startTime: 'asc' },
            select: { id: true, name: true, startTime: true, endTime: true }
        });

        // Get weekly menus
        const weeklyMenus = await prisma.weeklyMenu.findMany({
            where: { weekNumber: week, year },
            include: {
                menuItem: {
                    include: {
                        vendor: {
                            select: { id: true, name: true, logoUrl: true }
                        }
                    }
                },
                shift: {
                    select: { id: true, name: true }
                }
            }
        });

        // Organize by day
        const dailyMenus = dates.map((date, index) => {
            const dayOfWeek = date.getDay();
            const dayMenus = weeklyMenus.filter(m => m.dayOfWeek === dayOfWeek);

            return {
                date: date.toISOString().split('T')[0],
                dayOfWeek,
                dayName: dayNames[dayOfWeek],
                menus: dayMenus.map(m => ({
                    id: m.id,
                    menuMode: m.menuMode,
                    shiftId: m.shiftId,
                    shiftName: m.shift?.name || null,
                    notes: m.notes,
                    menuItem: {
                        id: m.menuItem.id,
                        name: m.menuItem.name,
                        description: m.menuItem.description,
                        imageUrl: m.menuItem.imageUrl,
                        category: m.menuItem.category,
                        vendor: m.menuItem.vendor
                    }
                }))
            };
        });

        res.json({
            week,
            year,
            weekStart: start.toISOString().split('T')[0],
            weekEnd: end.toISOString().split('T')[0],
            shifts,
            dailyMenus
        });
    } catch (error) {
        console.error('Get weekly menu error:', error);
        res.status(500).json({ error: 'Failed to get weekly menu' });
    }
});

/**
 * GET /api/weekly-menu/today
 * Get today's menu
 */
router.get('/today', async (req: AuthRequest, res: Response) => {
    try {
        const now = getNow();
        const week = getWeekNumber(now);
        const year = now.getFullYear();
        const dayOfWeek = now.getDay();

        const menus = await prisma.weeklyMenu.findMany({
            where: { weekNumber: week, year, dayOfWeek },
            include: {
                menuItem: {
                    include: {
                        vendor: {
                            select: { id: true, name: true, logoUrl: true }
                        }
                    }
                },
                shift: {
                    select: { id: true, name: true, startTime: true, endTime: true }
                }
            }
        });

        res.json({
            date: now.toISOString().split('T')[0],
            dayName: dayNames[dayOfWeek],
            menus: menus.map(m => ({
                id: m.id,
                menuMode: m.menuMode,
                shiftId: m.shiftId,
                shiftName: m.shift?.name || null,
                notes: m.notes,
                menuItem: {
                    id: m.menuItem.id,
                    name: m.menuItem.name,
                    description: m.menuItem.description,
                    imageUrl: m.menuItem.imageUrl,
                    category: m.menuItem.category,
                    vendor: m.menuItem.vendor
                }
            }))
        });
    } catch (error) {
        console.error('Get today menu error:', error);
        res.status(500).json({ error: 'Failed to get today menu' });
    }
});

/**
 * POST /api/weekly-menu
 * Set weekly menu for a day (Admin only)
 */
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { weekNumber, year, dayOfWeek, shiftId, menuMode, menuItemId, notes } = req.body;

        if (weekNumber === undefined || year === undefined || dayOfWeek === undefined || !menuItemId) {
            return res.status(400).json({ error: 'weekNumber, year, dayOfWeek, and menuItemId are required' });
        }

        // Verify menu item exists
        const menuItem = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
        if (!menuItem) {
            return res.status(400).json({ error: 'Menu item not found' });
        }

        // Verify shift if provided
        if (shiftId) {
            const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
            if (!shift) {
                return res.status(400).json({ error: 'Shift not found' });
            }
        }

        // Upsert the weekly menu
        const weeklyMenu = await prisma.weeklyMenu.upsert({
            where: {
                weekNumber_year_dayOfWeek_shiftId: {
                    weekNumber,
                    year,
                    dayOfWeek,
                    shiftId: shiftId || null
                }
            },
            update: {
                menuMode: menuMode || 'SAME_ALL_SHIFTS',
                menuItemId,
                notes: notes || null,
                createdBy: req.user!.id
            },
            create: {
                weekNumber,
                year,
                dayOfWeek,
                shiftId: shiftId || null,
                menuMode: menuMode || 'SAME_ALL_SHIFTS',
                menuItemId,
                notes: notes || null,
                createdBy: req.user!.id
            },
            include: {
                menuItem: {
                    include: {
                        vendor: { select: { id: true, name: true } }
                    }
                }
            }
        });

        // Broadcast SSE event
        sseManager.broadcast('weekly-menu:updated', {
            action: 'set',
            weekNumber,
            year,
            dayOfWeek,
            weeklyMenu
        });

        res.status(201).json(weeklyMenu);
    } catch (error) {
        console.error('Set weekly menu error:', error);
        res.status(500).json({ error: 'Failed to set weekly menu' });
    }
});

/**
 * POST /api/weekly-menu/copy
 * Copy weekly menu from one week to another (Admin only)
 */
router.post('/copy', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { fromWeek, fromYear, toWeek, toYear } = req.body;

        if (!fromWeek || !fromYear || !toWeek || !toYear) {
            return res.status(400).json({ error: 'fromWeek, fromYear, toWeek, and toYear are required' });
        }

        // Get source menus
        const sourceMenus = await prisma.weeklyMenu.findMany({
            where: { weekNumber: fromWeek, year: fromYear }
        });

        if (sourceMenus.length === 0) {
            return res.status(400).json({ error: 'No menus found in source week' });
        }

        // Delete existing menus in target week
        await prisma.weeklyMenu.deleteMany({
            where: { weekNumber: toWeek, year: toYear }
        });

        // Copy menus to target week
        const copiedMenus = await prisma.weeklyMenu.createMany({
            data: sourceMenus.map(m => ({
                weekNumber: toWeek,
                year: toYear,
                dayOfWeek: m.dayOfWeek,
                shiftId: m.shiftId,
                menuMode: m.menuMode,
                menuItemId: m.menuItemId,
                notes: m.notes,
                createdBy: req.user!.id
            }))
        });

        res.json({
            message: `Copied ${copiedMenus.count} menu entries from Week ${fromWeek}, ${fromYear} to Week ${toWeek}, ${toYear}`,
            count: copiedMenus.count
        });
    } catch (error) {
        console.error('Copy weekly menu error:', error);
        res.status(500).json({ error: 'Failed to copy weekly menu' });
    }
});

/**
 * DELETE /api/weekly-menu/:id
 * Delete a weekly menu entry (Admin only)
 */
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const existing = await prisma.weeklyMenu.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Weekly menu entry not found' });
        }

        await prisma.weeklyMenu.delete({ where: { id } });

        // Broadcast SSE event
        sseManager.broadcast('weekly-menu:updated', {
            action: 'deleted',
            weekNumber: existing.weekNumber,
            year: existing.year,
            weeklyMenuId: id
        });

        res.json({ message: 'Weekly menu entry deleted successfully' });
    } catch (error) {
        console.error('Delete weekly menu error:', error);
        res.status(500).json({ error: 'Failed to delete weekly menu' });
    }
});

/**
 * DELETE /api/weekly-menu/week/:week/:year
 * Delete all menu entries for a week (Admin only)
 */
router.delete('/week/:week/:year', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const week = parseInt(req.params.week);
        const year = parseInt(req.params.year);

        const result = await prisma.weeklyMenu.deleteMany({
            where: { weekNumber: week, year }
        });

        res.json({
            message: `Deleted ${result.count} menu entries for Week ${week}, ${year}`,
            count: result.count
        });
    } catch (error) {
        console.error('Delete week menu error:', error);
        res.status(500).json({ error: 'Failed to delete week menu' });
    }
});

export default router;
