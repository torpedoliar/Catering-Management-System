import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { isPastCutoff, getTimezone } from '../services/time.service';
import { prisma } from '../lib/prisma';

export const cutoffMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { shiftId } = req.body;

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

        const cutoffHours = settings?.cutoffHours || 6;

        // Check cutoff using timezone-aware function
        const cutoffInfo = isPastCutoff(shift.startTime, cutoffHours);
        const timezone = getTimezone();

        console.log(`[Cutoff] Checking ${shift.name}: Now=${cutoffInfo.now.toTimeString()}, Cutoff=${cutoffInfo.cutoffTime.toTimeString()}, IsPast=${cutoffInfo.isPast}, TZ=${timezone}`);

        // Check if we're past the cutoff
        if (cutoffInfo.isPast) {
            const formattedCutoff = cutoffInfo.cutoffTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            const formattedShiftStart = shift.startTime;

            return res.status(403).json({
                error: 'Order cutoff time has passed',
                message: `Orders for ${shift.name} (starts at ${formattedShiftStart}) must be placed before ${formattedCutoff} (${cutoffHours} hours before shift)`,
                cutoffTime: cutoffInfo.cutoffTime.toISOString(),
                shiftStart: cutoffInfo.shiftStart.toISOString(),
                currentTime: cutoffInfo.now.toISOString(),
                timezone,
                cutoffHours,
            });
        }

        // Attach shift to request for later use
        (req as any).shift = shift;
        next();
    } catch (error) {
        console.error('Cutoff middleware error:', error);
        return res.status(500).json({ error: 'Failed to validate cutoff time' });
    }
};
