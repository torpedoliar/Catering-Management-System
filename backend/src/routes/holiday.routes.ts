import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { getNow } from '../services/time.service';
import { sseManager } from '../controllers/sse.controller';
import { ErrorMessages } from '../utils/errorMessages';
import { logHoliday, getRequestContext } from '../services/audit.service';
import { prisma } from '../lib/prisma';

const router = Router();

// Get all holidays (with optional date range filter)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { startDate, endDate, year, month } = req.query;

        let where: any = { isActive: true };

        // Filter by year and month if provided
        if (year && month) {
            const start = new Date(Number(year), Number(month) - 1, 1);
            const end = new Date(Number(year), Number(month), 0);
            where.date = {
                gte: start,
                lte: end
            };
        } else if (startDate && endDate) {
            where.date = {
                gte: new Date(startDate as string),
                lte: new Date(endDate as string)
            };
        }

        const holidays = await prisma.holiday.findMany({
            where,
            orderBy: { date: 'asc' }
        });

        res.json({ holidays });
    } catch (error) {
        console.error('Get holidays error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Check if a specific date is a holiday
router.get('/check/:date', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const checkDate = new Date(req.params.date);
        checkDate.setHours(0, 0, 0, 0);

        const holiday = await prisma.holiday.findFirst({
            where: {
                date: checkDate,
                isActive: true
            }
        });

        res.json({
            isHoliday: !!holiday,
            holiday: holiday || null
        });
    } catch (error) {
        console.error('Check holiday error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Get calendar data for a month (holidays + order stats)
router.get('/calendar/:year/:month', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const year = parseInt(req.params.year);
        const month = parseInt(req.params.month);

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        // Get holidays for the month
        const holidays = await prisma.holiday.findMany({
            where: {
                date: {
                    gte: startDate,
                    lte: endDate
                },
                isActive: true
            },
            include: {
                shift: true
            },
            orderBy: { date: 'asc' }
        });

        // Get order counts per day for the month
        const orders = await prisma.order.groupBy({
            by: ['orderDate'],
            where: {
                orderDate: {
                    gte: startDate,
                    lte: endDate
                }
            },
            _count: { id: true }
        });

        // Get order counts per day per shift
        const ordersByShift = await prisma.order.groupBy({
            by: ['orderDate', 'shiftId'],
            where: {
                orderDate: {
                    gte: startDate,
                    lte: endDate
                }
            },
            _count: { id: true }
        });

        // Get all shifts for reference
        const shifts = await prisma.shift.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' }
        });

        // Format order stats by date
        const orderStats: Record<string, number> = {};
        orders.forEach(o => {
            const dateStr = new Date(o.orderDate).toISOString().split('T')[0];
            orderStats[dateStr] = o._count.id;
        });

        // Format order stats by date and shift
        const orderStatsByShift: Record<string, Record<string, { count: number; shiftName: string }>> = {};
        ordersByShift.forEach(o => {
            const dateStr = new Date(o.orderDate).toISOString().split('T')[0];
            const shift = shifts.find(s => s.id === o.shiftId);
            if (!orderStatsByShift[dateStr]) {
                orderStatsByShift[dateStr] = {};
            }
            orderStatsByShift[dateStr][o.shiftId] = {
                count: o._count.id,
                shiftName: shift?.name || 'Unknown'
            };
        });

        res.json({
            holidays,
            orderStats,
            orderStatsByShift,
            shifts,
            year,
            month
        });
    } catch (error) {
        console.error('Get calendar data error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Create holiday (Admin only)
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const { date, name, description, shiftId } = req.body;

        if (!date || !name) {
            return res.status(400).json({ error: ErrorMessages.MISSING_REQUIRED_FIELDS });
        }

        const holidayDate = new Date(date);
        holidayDate.setHours(0, 0, 0, 0);

        // Check if holiday already exists for this date + shift combo
        const existing = await prisma.holiday.findFirst({
            where: {
                date: holidayDate,
                shiftId: shiftId || null
            }
        });

        if (existing) {
            return res.status(400).json({ error: 'Hari libur sudah ada untuk tanggal dan shift ini' });
        }

        const holiday = await prisma.holiday.create({
            data: {
                date: holidayDate,
                name: name.trim(),
                description: description?.trim() || null,
                shiftId: shiftId || null
            },
            include: {
                shift: true
            }
        });

        await logHoliday('CREATE', req.user || null, holiday, context);

        // Broadcast holiday created
        sseManager.broadcast('holiday:updated', {
            action: 'created',
            holiday,
            timestamp: getNow().toISOString(),
        });

        res.status(201).json({ message: 'Holiday created successfully', holiday });
    } catch (error) {
        console.error('Create holiday error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Bulk create holidays (Admin only) - supports multiple entries with shift selection
router.post('/bulk', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const { entries } = req.body;

        // New format: entries is an array of { startDate, endDate, name, description, shiftId }
        // Old format: { dates, name, description } - still supported for backward compatibility
        let holidayEntries: any[] = [];

        if (entries && Array.isArray(entries)) {
            // New format with multiple entries
            holidayEntries = entries;
        } else if (req.body.dates && Array.isArray(req.body.dates)) {
            // Old format - convert to new format
            const { dates, name, description, shiftId } = req.body;
            holidayEntries = [{
                startDate: dates[0],
                endDate: dates[dates.length - 1],
                name,
                description,
                shiftId: shiftId || null
            }];
        } else {
            return res.status(400).json({ error: 'Invalid request format' });
        }

        const created: any[] = [];
        const skipped: string[] = [];

        for (const entry of holidayEntries) {
            const { startDate, endDate, name, description, shiftId } = entry;

            if (!startDate || !endDate || !name) {
                continue; // Skip invalid entries
            }

            const start = new Date(startDate);
            const end = new Date(endDate);

            // Generate all dates in range
            const currentDate = new Date(start);
            while (currentDate <= end) {
                const holidayDate = new Date(currentDate);
                holidayDate.setHours(0, 0, 0, 0);

                // Check if holiday already exists for this date + shift combo
                const existing = await prisma.holiday.findFirst({
                    where: {
                        date: holidayDate,
                        shiftId: shiftId || null
                    }
                });

                if (existing) {
                    skipped.push(holidayDate.toISOString().split('T')[0]);
                } else {
                    const holiday = await prisma.holiday.create({
                        data: {
                            date: holidayDate,
                            name: name.trim(),
                            description: description?.trim() || null,
                            shiftId: shiftId || null
                        },
                        include: {
                            shift: true
                        }
                    });
                    created.push(holiday);
                }

                currentDate.setDate(currentDate.getDate() + 1);
            }
        }

        // Log audit for bulk create
        if (created.length > 0) {
            for (const holiday of created) {
                await logHoliday('CREATE', req.user || null, holiday, context, {
                    metadata: { bulkCreate: true, totalCreated: created.length }
                });
            }

            // Broadcast bulk holiday created
            sseManager.broadcast('holiday:updated', {
                action: 'bulk-created',
                holidays: created,
                count: created.length,
                timestamp: getNow().toISOString(),
            });
        }

        res.status(201).json({
            message: `${created.length} hari libur berhasil ditambahkan, ${skipped.length} dilewati (sudah ada)`,
            created,
            skipped
        });
    } catch (error) {
        console.error('Bulk create holidays error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Update holiday (Admin only)
router.put('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const { date, name, description, isActive } = req.body;

        const oldHoliday = await prisma.holiday.findUnique({ where: { id: req.params.id } });

        const updateData: any = {};
        if (date) {
            const holidayDate = new Date(date);
            holidayDate.setHours(0, 0, 0, 0);
            updateData.date = holidayDate;
        }
        if (name) updateData.name = name.trim();
        if (description !== undefined) updateData.description = description?.trim() || null;
        if (typeof isActive === 'boolean') updateData.isActive = isActive;

        const holiday = await prisma.holiday.update({
            where: { id: req.params.id },
            data: updateData
        });

        await logHoliday('UPDATE', req.user || null, holiday, context, { oldValue: oldHoliday });

        // Broadcast holiday updated
        sseManager.broadcast('holiday:updated', {
            action: 'updated',
            holiday,
            timestamp: getNow().toISOString(),
        });

        res.json({ message: 'Holiday updated successfully', holiday });
    } catch (error: any) {
        console.error('Update holiday error:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: ErrorMessages.HOLIDAY_NOT_FOUND });
        }
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Delete holiday (Admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const holiday = await prisma.holiday.delete({
            where: { id: req.params.id }
        });

        await logHoliday('DELETE', req.user || null, holiday, context);

        // Broadcast holiday deleted
        sseManager.broadcast('holiday:updated', {
            action: 'deleted',
            holidayId: req.params.id,
            timestamp: getNow().toISOString(),
        });

        res.json({ message: 'Holiday deleted successfully' });
    } catch (error: any) {
        console.error('Delete holiday error:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: ErrorMessages.HOLIDAY_NOT_FOUND });
        }
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// ============================================
// SUNDAY AUTO-HOLIDAY ENDPOINTS
// ============================================

// Get Sunday auto-holiday status
router.get('/sundays/status', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        res.json({
            enabled: settings?.sundayAutoHoliday || false
        });
    } catch (error) {
        console.error('Get Sunday status error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Toggle Sunday auto-holiday (Admin only)
router.post('/sundays/toggle', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const { enabled, monthsAhead = 12 } = req.body;

        // Update settings
        await prisma.settings.upsert({
            where: { id: 'default' },
            update: { sundayAutoHoliday: enabled },
            create: { id: 'default', sundayAutoHoliday: enabled }
        });

        const now = getNow();
        let created = 0;
        let deleted = 0;

        if (enabled) {
            // Create holidays for all Sundays in the next X months
            const endDate = new Date(now);
            endDate.setMonth(endDate.getMonth() + monthsAhead);

            const currentDate = new Date(now);
            currentDate.setHours(0, 0, 0, 0);

            // Move to next Sunday if not already Sunday
            const daysUntilSunday = (7 - currentDate.getDay()) % 7;
            if (daysUntilSunday === 0 && currentDate.getDay() !== 0) {
                currentDate.setDate(currentDate.getDate() + 7);
            } else {
                currentDate.setDate(currentDate.getDate() + daysUntilSunday);
            }

            while (currentDate <= endDate) {
                // Check if Sunday holiday already exists
                const existing = await prisma.holiday.findFirst({
                    where: {
                        date: new Date(currentDate),
                        name: 'Hari Minggu',
                        shiftId: null
                    }
                });

                if (!existing) {
                    await prisma.holiday.create({
                        data: {
                            date: new Date(currentDate),
                            name: 'Hari Minggu',
                            description: 'Libur Hari Minggu (otomatis)',
                            shiftId: null,
                            isActive: true
                        }
                    });
                    created++;
                }

                // Move to next Sunday
                currentDate.setDate(currentDate.getDate() + 7);
            }
        } else {
            // Remove all auto-generated Sunday holidays
            const result = await prisma.holiday.deleteMany({
                where: {
                    name: 'Hari Minggu',
                    description: 'Libur Hari Minggu (otomatis)'
                }
            });
            deleted = result.count;
        }

        // Broadcast update
        sseManager.broadcast('holiday:updated', {
            action: 'sunday-toggle',
            enabled,
            created,
            deleted,
            timestamp: getNow().toISOString(),
        });

        // Also broadcast settings update for OrderPage refresh
        sseManager.broadcast('settings:updated', {
            sundayAutoHoliday: enabled,
            timestamp: getNow().toISOString(),
        });

        res.json({
            message: enabled
                ? `Libur Hari Minggu diaktifkan. ${created} hari libur dibuat.`
                : `Libur Hari Minggu dinonaktifkan. ${deleted} hari libur dihapus.`,
            enabled,
            created,
            deleted
        });
    } catch (error) {
        console.error('Toggle Sunday holiday error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Override specific Sunday (Admin only) - mark as NOT holiday
router.post('/sundays/override/:date', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const dateStr = req.params.date;
        const targetDate = new Date(dateStr);
        targetDate.setHours(0, 0, 0, 0);

        // Verify it's actually a Sunday
        if (targetDate.getDay() !== 0) {
            return res.status(400).json({ error: 'Tanggal yang dipilih bukan hari Minggu' });
        }

        const { override } = req.body; // true = make it work day, false = restore as holiday

        if (override) {
            // Remove the Sunday holiday
            const deleted = await prisma.holiday.deleteMany({
                where: {
                    date: targetDate,
                    name: 'Hari Minggu'
                }
            });

            // Broadcast update
            sseManager.broadcast('holiday:updated', {
                action: 'sunday-override',
                date: dateStr,
                override: true,
                timestamp: getNow().toISOString(),
            });

            res.json({
                message: `Minggu ${dateStr} diubah menjadi hari kerja`,
                deleted: deleted.count
            });
        } else {
            // Create Sunday holiday
            const existing = await prisma.holiday.findFirst({
                where: { date: targetDate, name: 'Hari Minggu' }
            });

            if (!existing) {
                await prisma.holiday.create({
                    data: {
                        date: targetDate,
                        name: 'Hari Minggu',
                        description: 'Libur Hari Minggu (otomatis)',
                        shiftId: null,
                        isActive: true
                    }
                });
            }

            // Broadcast update
            sseManager.broadcast('holiday:updated', {
                action: 'sunday-override',
                date: dateStr,
                override: false,
                timestamp: getNow().toISOString(),
            });

            res.json({
                message: `Minggu ${dateStr} dikembalikan menjadi hari libur`
            });
        }
    } catch (error) {
        console.error('Sunday override error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

export default router;
