/**
 * Timezone Utility Functions
 *
 * IMPORTANT — TZ semantics:
 * The backend uses "Fake UTC": process TZ is forced to UTC, but stored Date
 * fields actually hold catering-tz (Asia/Jakarta) wall-clock values. ISO
 * timestamps are serialized with a `Z` suffix that is misleading.
 *
 * For displaying these timestamps to a user:
 *  - In WIB (Asia/Jakarta), the literal slice "YYYY-MM-DD HH:mm" matches
 *    what the user expects, with NO conversion.
 *  - In other timezones, the stored value is still shown verbatim — this is
 *    intentional. The server's wall-clock is the source of truth for shifts
 *    and order slots; re-converting for the viewer's tz would mislead.
 *
 * For "what day is it for the user right now", use getLocalDateString from
 * utils/dateHelpers.ts instead.
 */

/**
 * Format a backend ISO timestamp by direct substring slicing — no Date
 * parsing, no `toLocaleString`, no tz conversion. The result is the stored
 * wall-clock value as the server wrote it.
 *
 * Accepts the legacy `options` parameter for back-compat with callers that
 * pass Intl.DateTimeFormatOptions, but the options are IGNORED. Use the
 * dedicated helpers below (formatTimeWIB, formatDateWIB, ...) which respect
 * the timeOnly/dateOnly shape callers actually want.
 *
 * @param dateInput backend ISO string
 * @param _options ignored (kept for back-compat)
 * @returns "YYYY-MM-DD HH:mm" in the stored wall-clock, or "-" for invalid
 */
export function formatToWIB(
    dateInput: string | Date | undefined | null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: Intl.DateTimeFormatOptions = {}
): string {
    if (!dateInput) return '-';

    try {
        if (dateInput instanceof Date) {
            if (isNaN(dateInput.getTime())) return '-';
            const iso = dateInput.toISOString();
            return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
        }

        if (typeof dateInput !== 'string') return '-';

        // Strict ISO check. Reject anything that doesn't look like our stored
        // format, including locale strings or RFC timezones — silently doing
        // a `new Date(...)` re-parse on those would re-convert the Fake-UTC
        // value and produce wrong output for non-WIB viewers.
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateInput)) return '-';

        return `${dateInput.slice(0, 10)} ${dateInput.slice(11, 16)}`;
    } catch {
        return '-';
    }
}

/**
 * Format date and time with full details (for check-in, logs, etc.)
 * Returns "YYYY-MM-DD HH:mm" — same as formatToWIB; locale-aware labels were
 * removed because `toLocaleString` re-converts.
 */
export function formatDateTimeWIB(dateInput: string | Date | undefined | null): string {
    return formatToWIB(dateInput);
}

/**
 * Format date and time short (YYYY-MM-DD HH:mm)
 */
export function formatDateTimeShortWIB(dateInput: string | Date | undefined | null): string {
    return formatToWIB(dateInput);
}

/**
 * Format time only (HH:mm)
 */
export function formatTimeWIB(dateInput: string | Date | undefined | null): string {
    if (!dateInput) return '-';
    if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return '-';
        return dateInput.toISOString().slice(11, 16);
    }
    if (typeof dateInput !== 'string') return '-';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateInput)) return '-';
    return dateInput.slice(11, 16);
}

/**
 * Format time with seconds (HH:mm:ss)
 */
export function formatTimeWithSecondsWIB(dateInput: string | Date | undefined | null): string {
    if (!dateInput) return '-';
    if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return '-';
        return dateInput.toISOString().slice(11, 19);
    }
    if (typeof dateInput !== 'string') return '-';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateInput)) return '-';
    return dateInput.slice(11, 19);
}

/**
 * Format date only (YYYY-MM-DD)
 */
export function formatDateWIB(dateInput: string | Date | undefined | null): string {
    if (!dateInput) return '-';
    if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return '-';
        return dateInput.toISOString().slice(0, 10);
    }
    if (typeof dateInput !== 'string') return '-';
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateInput)) return '-';
    return dateInput.slice(0, 10);
}

/**
 * Format date long — kept as a noop wrapper around formatDateWIB. The
 * previous "EEEE, dd MMMM yyyy" rendering required toLocaleString which
 * re-converts the Fake-UTC value; we now return the YYYY-MM-DD form which
 * is correct in all viewer timezones.
 */
export function formatDateLongWIB(dateInput: string | Date | undefined | null): string {
    return formatDateWIB(dateInput);
}
