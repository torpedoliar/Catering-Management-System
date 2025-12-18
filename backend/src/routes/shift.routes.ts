import { Router, Response } from 'express';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { getNow, isPastCutoff, getTimezone, getOrderableDateRange } from '../services/time.service';
import { sseManager } from '../controllers/sse.controller';
import { ErrorMessages } from '../utils/errorMessages';
import { cacheService, CACHE_KEYS, CACHE_TTL } from '../services/cache.service';
import { logShift, getRequestContext } from '../services/audit.service';
import { prisma } from '../lib/prisma';

const router = Router();

// Get all shifts (with caching)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const includeInactive = req.query.includeInactive === 'true';
        const cacheKey = includeInactive ? `${CACHE_KEYS.SHIFTS}:all` : CACHE_KEYS.SHIFTS;

        // Try cache first (only for active shifts)
        const result = await cacheService.getOrSet(
            cacheKey,
            async () => {
                const shifts = await prisma.shift.findMany({
                    where: includeInactive ? {} : { isActive: true },
                    orderBy: { name: 'asc' },
                });

                // Add cutoff validation info
                const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
                const cutoffMode = settings?.cutoffMode || 'per-shift';
                const cutoffDays = settings?.cutoffDays || 0;
                const cutoffHours = settings?.cutoffHours || 6;
                const now = getNow();
                const timezone = getTimezone();

                console.log(`[Shifts] Current time: ${now.toISOString()}, Timezone: ${timezone}, Mode: ${cutoffMode}`);

                // Get orderable date range for weekly mode
                let orderableDates: Date[] = [];
                if (cutoffMode === 'weekly') {
                    const rangeResult = getOrderableDateRange({
                        cutoffMode: 'weekly',
                        cutoffDays,
                        cutoffHours,
                        maxOrderDaysAhead: settings?.maxOrderDaysAhead || 7,
                        weeklyCutoffDay: settings?.weeklyCutoffDay ?? 5,
                        weeklyCutoffHour: settings?.weeklyCutoffHour ?? 17,
                        weeklyCutoffMinute: settings?.weeklyCutoffMinute ?? 0,
                        orderableDays: settings?.orderableDays || '1,2,3,4,5,6',
                        maxWeeksAhead: settings?.maxWeeksAhead || 1,
                    });
                    orderableDates = rangeResult.dates;
                }

                const shiftsWithCutoff = shifts.map((shift) => {
                    if (cutoffMode === 'weekly') {
                        // For weekly mode, canOrder is based on whether there are orderable dates
                        return {
                            ...shift,
                            canOrder: shift.isActive && orderableDates.length > 0,
                            cutoffTime: null,
                            minutesUntilCutoff: null,
                            cutoffMode: 'weekly',
                        };
                    } else {
                        // Per-shift mode: use existing logic
                        const cutoffInfo = isPastCutoff(shift.startTime, cutoffDays, cutoffHours);
                        console.log(`[Shifts] ${shift.name}: Start=${shift.startTime}, Cutoff=${cutoffInfo.cutoffTime.toTimeString()}, IsPast=${cutoffInfo.isPast}`);
                        return {
                            ...shift,
                            canOrder: shift.isActive && !cutoffInfo.isPast,
                            cutoffTime: cutoffInfo.cutoffTime.toISOString(),
                            minutesUntilCutoff: cutoffInfo.minutesUntilCutoff,
                            cutoffMode: 'per-shift',
                        };
                    }
                });

                return {
                    shifts: shiftsWithCutoff,
                    cutoffMode,
                    cutoffDays,
                    cutoffHours,
                    orderableDates: orderableDates.map(d => d.toISOString().split('T')[0]),
                    serverTime: now.toISOString(),
                    timezone
                };
            },
            { ttl: CACHE_TTL.SHIFTS }
        );

        res.json(result);
    } catch (error) {
        console.error('Get shifts error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Get shifts available for the current user (based on department's allowed shifts)
router.get('/for-user', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        // Get user's department with allowed shifts
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                departmentRef: {
                    include: {
                        allowedShifts: {
                            include: {
                                shift: true
                            }
                        }
                    }
                }
            }
        });

        // Get settings for cutoff calculation
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        const cutoffMode = settings?.cutoffMode || 'per-shift';
        const cutoffDays = settings?.cutoffDays || 0;
        const cutoffHours = settings?.cutoffHours || 6;
        const now = getNow();
        const timezone = getTimezone();

        // Get orderable dates for weekly mode
        let orderableDates: string[] = [];
        if (cutoffMode === 'weekly') {
            const rangeResult = getOrderableDateRange({
                cutoffMode: 'weekly',
                cutoffDays,
                cutoffHours,
                maxOrderDaysAhead: settings?.maxOrderDaysAhead || 7,
                weeklyCutoffDay: settings?.weeklyCutoffDay ?? 5,
                weeklyCutoffHour: settings?.weeklyCutoffHour ?? 17,
                weeklyCutoffMinute: settings?.weeklyCutoffMinute ?? 0,
                orderableDays: settings?.orderableDays || '1,2,3,4,5,6',
                maxWeeksAhead: settings?.maxWeeksAhead || 1,
            });
            orderableDates = rangeResult.dates.map(d => d.toISOString().split('T')[0]);
        }

        let shifts;

        // If user has department with allowed shifts, use those
        let department = user?.departmentRef;

        // If not linked by ID, try to find by string matching
        if (!department && user?.department && user.division && user.company) {
            department = await prisma.department.findFirst({
                where: {
                    name: { equals: user.department, mode: 'insensitive' },
                    division: {
                        name: { equals: user.division, mode: 'insensitive' },
                        company: {
                            name: { equals: user.company, mode: 'insensitive' }
                        }
                    }
                },
                include: {
                    allowedShifts: {
                        include: {
                            shift: true
                        }
                    }
                }
            });
        }

        if (department?.allowedShifts && department.allowedShifts.length > 0) {
            shifts = department.allowedShifts
                .map(ds => ds.shift)
                .filter(shift => shift.isActive);
        } else {
            // Otherwise, fall back to all active shifts
            shifts = await prisma.shift.findMany({
                where: { isActive: true },
                orderBy: { name: 'asc' }
            });
        }

        // Parse date parameter (defaults to today if not provided)
        let targetDate: Date;
        if (req.query.date) {
            // Parse date string as local date
            const dateStr = req.query.date as string;
            const dateParts = dateStr.split('-');
            if (dateParts.length === 3) {
                const year = parseInt(dateParts[0]);
                const month = parseInt(dateParts[1]) - 1;
                const day = parseInt(dateParts[2]);
                targetDate = new Date(year, month, day, 0, 0, 0, 0);
            } else {
                targetDate = new Date(dateStr);
            }
            if (isNaN(targetDate.getTime())) {
                return res.status(400).json({ error: 'Invalid date format' });
            }
            targetDate.setHours(0, 0, 0, 0);
        } else {
            targetDate = new Date(now);
            targetDate.setHours(0, 0, 0, 0);
        }

        // Check for holidays on this date
        const holidayDateStart = new Date(targetDate);
        holidayDateStart.setHours(0, 0, 0, 0);
        const holidayDateEnd = new Date(targetDate);
        holidayDateEnd.setHours(23, 59, 59, 999);

        const holidays = await prisma.holiday.findMany({
            where: {
                date: {
                    gte: holidayDateStart,
                    lte: holidayDateEnd
                },
                isActive: true
            }
        });

        const shiftsWithCutoff = shifts.map((shift) => {
            // Check if this shift has a holiday
            const shiftHoliday = holidays.find(h => h.shiftId === shift.id);
            const fulldayHoliday = holidays.find(h => h.shiftId === null);
            const holiday = shiftHoliday || fulldayHoliday;

            // Calculate cutoff time for the target date (days + hours)
            const [hours, minutes] = shift.startTime.split(':').map(Number);
            const shiftStartDateTime = new Date(targetDate);
            shiftStartDateTime.setHours(hours, minutes, 0, 0);

            const cutoffMs = (cutoffDays * 24 * 60 * 60 * 1000) + (cutoffHours * 60 * 60 * 1000);
            const cutoffDateTime = new Date(shiftStartDateTime.getTime() - cutoffMs);
            const minutesUntilCutoff = Math.max(0, Math.floor((cutoffDateTime.getTime() - now.getTime()) / 60000));

            return {
                ...shift,
                canOrder: holiday ? false : now < cutoffDateTime,
                cutoffTime: cutoffDateTime.toISOString(),
                minutesUntilCutoff,
                holiday: holiday ? {
                    name: holiday.name,
                    isFullday: !holiday.shiftId
                } : null
            };
        });

        res.json({ shifts: shiftsWithCutoff, cutoffMode, cutoffDays, cutoffHours, orderableDates, serverTime: now.toISOString(), timezone });
    } catch (error) {
        console.error('Get user shifts error:', error);
        res.status(500).json({ error: 'Failed to get shifts' });
    }
});

// Get single shift
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const shift = await prisma.shift.findUnique({
            where: { id: req.params.id },
        });

        if (!shift) {
            return res.status(404).json({ error: 'Shift not found' });
        }

        res.json(shift);
    } catch (error) {
        console.error('Get shift error:', error);
        res.status(500).json({ error: 'Failed to get shift' });
    }
});

// Create shift (Admin only)
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { name, startTime, endTime, mealPrice } = req.body;

        if (!name || !startTime || !endTime) {
            return res.status(400).json({ error: 'Name, start time, and end time are required' });
        }

        // Validate time format
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            return res.status(400).json({ error: 'Invalid time format. Use HH:mm' });
        }

        const shift = await prisma.shift.create({
            data: {
                name,
                startTime,
                endTime,
                ...(mealPrice !== undefined && { mealPrice })
            },
        });

        // Log audit
        await logShift('CREATE', req.user || null, shift, getRequestContext(req));

        // Invalidate cache
        await cacheService.delete(`${CACHE_KEYS.SHIFTS}*`);

        // Broadcast shift created
        sseManager.broadcast('shift:updated', {
            action: 'created',
            shift,
            timestamp: getNow().toISOString(),
        });

        res.status(201).json(shift);
    } catch (error: any) {
        console.error('Create shift error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Shift with this name already exists' });
        }
        res.status(500).json({ error: 'Failed to create shift' });
    }
});

// Update shift (Admin only)
router.put('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { name, startTime, endTime, isActive, mealPrice } = req.body;

        // Get old shift for audit
        const oldShift = await prisma.shift.findUnique({ where: { id: req.params.id } });

        // Validate time format if provided
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (startTime && !timeRegex.test(startTime)) {
            return res.status(400).json({ error: 'Invalid start time format. Use HH:mm' });
        }
        if (endTime && !timeRegex.test(endTime)) {
            return res.status(400).json({ error: 'Invalid end time format. Use HH:mm' });
        }

        const shift = await prisma.shift.update({
            where: { id: req.params.id },
            data: {
                ...(name && { name }),
                ...(startTime && { startTime }),
                ...(endTime && { endTime }),
                ...(isActive !== undefined && { isActive }),
                ...(mealPrice !== undefined && { mealPrice }),
            },
        });

        // Log audit
        await logShift('UPDATE', req.user || null, shift, getRequestContext(req), { oldValue: oldShift });

        // Invalidate cache
        await cacheService.delete(`${CACHE_KEYS.SHIFTS}*`);

        // Broadcast shift updated
        sseManager.broadcast('shift:updated', {
            action: 'updated',
            shift,
            timestamp: getNow().toISOString(),
        });

        res.json(shift);
    } catch (error) {
        console.error('Update shift error:', error);
        res.status(500).json({ error: 'Failed to update shift' });
    }
});

// Delete shift (Admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const shift = await prisma.shift.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });

        // Log audit
        await logShift('DELETE', req.user || null, shift, getRequestContext(req));

        // Invalidate cache
        await cacheService.delete(`${CACHE_KEYS.SHIFTS}*`);

        // Broadcast shift deleted/deactivated
        sseManager.broadcast('shift:updated', {
            action: 'deleted',
            shift,
            timestamp: getNow().toISOString(),
        });

        res.json({ message: 'Shift deactivated successfully' });
    } catch (error) {
        console.error('Delete shift error:', error);
        res.status(500).json({ error: 'Failed to delete shift' });
    }
});

export default router;
