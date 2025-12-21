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
