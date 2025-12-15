/**
 * Timezone Utility Functions
 * Handles consistent date/time formatting in WIB (Asia/Jakarta) timezone
 */

/**
 * Formats a date/time string or Date object to WIB timezone
 * Properly handles:
 * - ISO strings with 'Z' (UTC): "2025-12-12T01:39:00.000Z" 
 * - ISO strings without 'Z' (local): "2025-12-12T08:39:00"
 * - Date objects
 * 
 * @param dateInput - Date string or Date object from backend
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted string in WIB timezone
 */
export function formatToWIB(
    dateInput: string | Date | undefined | null,
    options: Intl.DateTimeFormatOptions = {}
): string {
    if (!dateInput) return '-';

    try {
        let date: Date;

        if (typeof dateInput === 'string') {
            // Check if it's an ISO string with Z (UTC format from database)
            if (dateInput.endsWith('Z') || dateInput.includes('+')) {
                // Keep as-is, let JavaScript parse as UTC
                date = new Date(dateInput);
            } else if (dateInput.includes('T')) {
                // ISO format without timezone - assume it's already WIB, add +07:00
                date = new Date(dateInput + '+07:00');
            } else {
                // Simple date string
                date = new Date(dateInput);
            }
        } else {
            date = new Date(dateInput);
        }

        if (isNaN(date.getTime())) return '-';

        return date.toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta',
            ...options
        });
    } catch {
        return '-';
    }
}

/**
 * Format date and time with full details (for check-in, logs, etc.)
 */
export function formatDateTimeWIB(dateInput: string | Date | undefined | null): string {
    return formatToWIB(dateInput, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Format date and time short (dd MMM yyyy, HH:mm)
 */
export function formatDateTimeShortWIB(dateInput: string | Date | undefined | null): string {
    return formatToWIB(dateInput, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format time only (HH:mm)
 */
export function formatTimeWIB(dateInput: string | Date | undefined | null): string {
    return formatToWIB(dateInput, {
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format time with seconds (HH:mm:ss)
 */
export function formatTimeWithSecondsWIB(dateInput: string | Date | undefined | null): string {
    return formatToWIB(dateInput, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Format date only (dd MMM yyyy)
 */
export function formatDateWIB(dateInput: string | Date | undefined | null): string {
    return formatToWIB(dateInput, {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

/**
 * Format date long (EEEE, dd MMMM yyyy)
 */
export function formatDateLongWIB(dateInput: string | Date | undefined | null): string {
    return formatToWIB(dateInput, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}
