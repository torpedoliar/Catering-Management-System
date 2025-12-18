import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { isPastCutoff, isPastCutoffForDate, isDateOrderableWeekly, getTimezone } from '../services/time.service';
import { prisma } from '../lib/prisma';

export const cutoffMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { shiftId, orderDate } = req.body;

        if (!shiftId) {
            return res.status(400).json({ error: 'Shift ID is required' });
        }

        // Get shift and settings
        const [shift, settings] = await Promise.all([
            prisma.shift.findUnique({ where: { id: shiftId } }),
            prisma.settings.findUnique({ where: { id: 'default' } }),
        ]);

        if (!shift) {
            return res.status(404).json({ error: 'Shift not found' });
        }

        if (!shift.isActive) {
            return res.status(400).json({ error: 'This shift is not active' });
        }

        const cutoffMode = settings?.cutoffMode || 'per-shift';
        const cutoffDays = settings?.cutoffDays || 0;
        const cutoffHours = settings?.cutoffHours || 6;
        const timezone = getTimezone();

        console.log(`[Cutoff] Mode: ${cutoffMode}, Shift: ${shift.name}, TZ: ${timezone}`);

        if (cutoffMode === 'weekly') {
            // Weekly mode: check if the order date is orderable
            if (!orderDate) {
                return res.status(400).json({ error: 'Order date is required for weekly cutoff mode' });
            }

            const parsedDate = new Date(orderDate);
            const weeklyCheck = isDateOrderableWeekly(parsedDate, {
                weeklyCutoffDay: settings?.weeklyCutoffDay || 5,
                weeklyCutoffHour: settings?.weeklyCutoffHour || 17,
                weeklyCutoffMinute: settings?.weeklyCutoffMinute || 0,
                orderableDays: settings?.orderableDays || '1,2,3,4,5,6',
                maxWeeksAhead: settings?.maxWeeksAhead || 1,
            });

            console.log(`[Cutoff Weekly] Date: ${orderDate}, CanOrder: ${weeklyCheck.canOrder}, Reason: ${weeklyCheck.reason}`);

            if (!weeklyCheck.canOrder) {
                return res.status(403).json({
                    error: 'Order cutoff time has passed',
                    message: weeklyCheck.reason || 'Tanggal ini tidak dapat dipesan dalam mode cutoff mingguan',
                    cutoffMode: 'weekly',
                    orderDate,
                    timezone,
                });
            }
        } else {
            // Per-shift mode: use existing logic
            if (orderDate) {
                // For dated orders (like bulk), use isPastCutoffForDate
                const parsedDate = new Date(orderDate);
                const cutoffInfo = isPastCutoffForDate(parsedDate, shift.startTime, cutoffDays, cutoffHours);

                console.log(`[Cutoff PerShift] Date: ${orderDate}, Shift: ${shift.name}, IsPast: ${cutoffInfo.isPast}`);

                if (cutoffInfo.isPast) {
                    const cutoffDesc = cutoffDays > 0 ? `${cutoffDays} hari ${cutoffHours} jam` : `${cutoffHours} jam`;
                    return res.status(403).json({
                        error: 'Order cutoff time has passed',
                        message: `Pesanan untuk ${shift.name} pada tanggal ${orderDate} harus dilakukan sebelum ${cutoffDesc} dari waktu shift`,
                        cutoffTime: cutoffInfo.cutoffTime.toISOString(),
                        currentTime: cutoffInfo.now.toISOString(),
                        timezone,
                        cutoffDays,
                        cutoffHours,
                    });
                }
            } else {
                // Today's order - use isPastCutoff
                const cutoffInfo = isPastCutoff(shift.startTime, cutoffDays, cutoffHours);

                console.log(`[Cutoff] Checking ${shift.name}: Now=${cutoffInfo.now.toTimeString()}, Cutoff=${cutoffInfo.cutoffTime.toTimeString()}, IsPast=${cutoffInfo.isPast}`);

                if (cutoffInfo.isPast) {
                    const formattedCutoff = cutoffInfo.cutoffTime.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                    const formattedShiftStart = shift.startTime;
                    const cutoffDesc = cutoffDays > 0 ? `${cutoffDays} hari ${cutoffHours} jam` : `${cutoffHours} jam`;

                    return res.status(403).json({
                        error: 'Order cutoff time has passed',
                        message: `Orders for ${shift.name} (starts at ${formattedShiftStart}) must be placed before ${formattedCutoff} (${cutoffDesc} sebelum shift)`,
                        cutoffTime: cutoffInfo.cutoffTime.toISOString(),
                        shiftStart: cutoffInfo.shiftStart.toISOString(),
                        currentTime: cutoffInfo.now.toISOString(),
                        timezone,
                        cutoffDays,
                        cutoffHours,
                    });
                }
            }
        }

        // Attach shift to request for later use
        (req as any).shift = shift;
        next();
    } catch (error) {
        console.error('Cutoff middleware error:', error);
        return res.status(500).json({ error: 'Failed to validate cutoff time' });
    }
};
