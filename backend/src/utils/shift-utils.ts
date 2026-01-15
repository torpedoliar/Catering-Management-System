/**
 * Shared shift utilities for overnight shift detection and time handling.
 * Used by: noshow.service.ts, order.routes.ts (and split modules)
 * 
 * @module shift-utils
 */

/**
 * Check if a shift is an overnight shift (ends the next day).
 * Example: 23:00 - 07:00 is overnight because endTime < startTime
 * 
 * @param startTime - Shift start time in HH:mm format
 * @param endTime - Shift end time in HH:mm format
 * @returns true if the shift spans across midnight
 */
export function isOvernightShift(startTime: string, endTime: string): boolean {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    // End time is before or equal to start time means overnight
    return endH < startH || (endH === startH && endM <= startM);
}

/**
 * Parse a time string into hours and minutes components.
 * 
 * @param timeStr - Time in HH:mm format
 * @returns Object with hours and minutes as numbers
 */
export function parseShiftTime(timeStr: string): { hours: number; minutes: number } {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
}

/**
 * Check if a daytime (non-overnight) shift has ended for today.
 * 
 * NOTE: This function returns false for overnight shifts.
 * Overnight shifts should be handled separately by checking
 * orders from the previous day.
 * 
 * @param shift - Shift object with startTime and endTime
 * @param currentTime - Current time in HH:mm format
 * @returns true if the daytime shift has ended
 */
export function hasDaytimeShiftEndedToday(
    shift: { startTime: string; endTime: string },
    currentTime: string
): boolean {
    // Overnight shifts are never "ended today" in this context
    if (isOvernightShift(shift.startTime, shift.endTime)) {
        return false;
    }

    const [currH, currM] = currentTime.split(':').map(Number);
    const [endH, endM] = shift.endTime.split(':').map(Number);

    // Current time is after end time
    return currH > endH || (currH === endH && currM > endM);
}

/**
 * Check if current time is after a specific time (HH:mm format).
 * 
 * @param currentTime - Current time in HH:mm format
 * @param targetTime - Target time to compare in HH:mm format
 * @returns true if currentTime is after targetTime
 */
export function isTimeAfter(currentTime: string, targetTime: string): boolean {
    const [currH, currM] = currentTime.split(':').map(Number);
    const [targetH, targetM] = targetTime.split(':').map(Number);

    return currH > targetH || (currH === targetH && currM > targetM);
}

/**
 * Calculate the actual end datetime for a shift, considering overnight shifts.
 * For overnight shifts, the end time is on the next day.
 * 
 * @param orderDate - The date the order was placed
 * @param shift - Shift object with startTime and endTime
 * @returns Date object representing when the shift actually ends
 */
export function calculateShiftEndDateTime(
    orderDate: Date,
    shift: { startTime: string; endTime: string }
): Date {
    const { hours: endH, minutes: endM } = parseShiftTime(shift.endTime);

    const shiftEnd = new Date(orderDate);
    shiftEnd.setHours(endH, endM, 0, 0);

    // If overnight shift, end time is next day
    if (isOvernightShift(shift.startTime, shift.endTime)) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    return shiftEnd;
}

/**
 * Calculate the actual start datetime for a shift.
 * 
 * @param orderDate - The date the order was placed
 * @param shift - Shift object with startTime
 * @returns Date object representing when the shift starts
 */
export function calculateShiftStartDateTime(
    orderDate: Date,
    shift: { startTime: string }
): Date {
    const { hours: startH, minutes: startM } = parseShiftTime(shift.startTime);

    const shiftStart = new Date(orderDate);
    shiftStart.setHours(startH, startM, 0, 0);

    return shiftStart;
}

/**
 * Shift type with optional break times
 */
export interface ShiftWithBreakTime {
    startTime: string;
    endTime: string;
    breakStartTime?: string | null;
    breakEndTime?: string | null;
}

/**
 * Result of check-in time validation
 */
export interface CheckinValidationResult {
    valid: boolean;
    error?: string;
    message?: string;
}

/**
 * Calculate break time window for check-in, considering overnight breaks.
 * If break times are not set, returns null (use shift window instead).
 * 
 * @param orderDate - The date the order was placed
 * @param shift - Shift object with break times
 * @param shiftStart - Pre-calculated shift start datetime
 * @param shiftEnd - Pre-calculated shift end datetime
 * @returns Object with breakStart and breakEnd dates, or null if no break times
 */
export function calculateBreakWindow(
    orderDate: Date,
    shift: ShiftWithBreakTime,
    shiftStart: Date,
    shiftEnd: Date
): { breakStart: Date; breakEnd: Date } | null {
    if (!shift.breakStartTime || !shift.breakEndTime) {
        return null;
    }

    const { hours: breakStartH, minutes: breakStartM } = parseShiftTime(shift.breakStartTime);
    const { hours: breakEndH, minutes: breakEndM } = parseShiftTime(shift.breakEndTime);

    const breakStart = new Date(orderDate);
    breakStart.setHours(breakStartH, breakStartM, 0, 0);

    const breakEnd = new Date(orderDate);
    breakEnd.setHours(breakEndH, breakEndM, 0, 0);

    // Handle overnight break (break spans midnight)
    // Example: Shift 22:00-06:00, Break 00:30-01:30
    // If break start is before shift start in same day, it means next day
    if (breakStart < shiftStart) {
        breakStart.setDate(breakStart.getDate() + 1);
    }
    if (breakEnd <= breakStart) {
        breakEnd.setDate(breakEnd.getDate() + 1);
    }

    return { breakStart, breakEnd };
}

/**
 * Validate if a check-in is allowed based on current time.
 * Uses break time window if set, otherwise uses shift window.
 * 
 * @param order - Order with orderDate and shift information
 * @param currentTime - Current datetime
 * @returns Validation result with valid flag and error/message if invalid
 */
export function validateCheckinTimeWindow(
    order: {
        orderDate: Date;
        shift: ShiftWithBreakTime
    },
    currentTime: Date
): CheckinValidationResult {
    const orderDate = new Date(order.orderDate);
    orderDate.setHours(0, 0, 0, 0);

    const { hours: startH, minutes: startM } = parseShiftTime(order.shift.startTime);
    const { hours: endH, minutes: endM } = parseShiftTime(order.shift.endTime);

    // Calculate shift window
    const shiftStart = new Date(orderDate);
    shiftStart.setHours(startH, startM, 0, 0);

    const shiftEnd = new Date(orderDate);
    shiftEnd.setHours(endH, endM, 0, 0);

    // Handle overnight shifts
    if (shiftEnd <= shiftStart) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    // Check if break times are set
    const breakWindow = calculateBreakWindow(orderDate, order.shift, shiftStart, shiftEnd);

    if (breakWindow) {
        // Use break time window for validation
        const { breakStart, breakEnd } = breakWindow;

        if (currentTime < breakStart) {
            return {
                valid: false,
                error: 'Belum waktunya istirahat',
                message: `Pengambilan makanan dimulai pada ${breakStart.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
            };
        }

        if (currentTime > breakEnd) {
            return {
                valid: false,
                error: 'Jam istirahat sudah selesai',
                message: `Pengambilan makanan berakhir pada ${breakEnd.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
            };
        }
    } else {
        // No break times set - use shift window (current behavior)
        // Allow 30 min before shift start
        const allowedStart = new Date(shiftStart.getTime() - 30 * 60000);

        if (currentTime < allowedStart) {
            return {
                valid: false,
                error: 'Terlalu dini untuk check-in',
                message: `Check-in dimulai pada ${allowedStart.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
            };
        }

        if (currentTime > shiftEnd) {
            return {
                valid: false,
                error: 'Waktu check-in sudah lewat',
                message: `Check-in berakhir pada ${shiftEnd.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
            };
        }
    }

    return { valid: true };
}
