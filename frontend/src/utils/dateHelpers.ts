/**
 * Date helpers for the catering frontend.
 *
 * Backend stores timestamps in "Fake UTC" (server TZ=UTC, but Date fields
 * actually hold catering-tz wall-clock). The helpers here:
 *  - produce YYYY-MM-DD keys in the BROWSER's local calendar (the user lives
 *    in a tz; we display "today" by their clock, not by the server's)
 *  - do calendar arithmetic via string math to avoid DST/tz pitfalls of
 *    `Date.now() + n*86400000`
 *  - render order timestamps by stripping the ISO parts directly — no
 *    `toLocaleString` re-conversion, so the displayed wall-clock is the
 *    server's stored value regardless of viewer tz.
 *
 * For deeper timezone formatting (locale-aware labels, etc.), use
 * utils/timezone.ts — but note that `formatToWIB` re-renders via toLocaleString
 * and is only correct for users in WIB. For non-WIB users prefer the helpers
 * in this file.
 */

/**
 * Format a Date as YYYY-MM-DD using local calendar fields.
 * This is the "what day is it for the user" key, NOT a server-tz key.
 *
 * @param d default new Date()
 *
 * @example
 *   getLocalDateString() // "2026-06-13" (user in WIB at 02:00)
 *   getLocalDateString(new Date("2026-02-20T17:00:00Z")) // "2026-02-21" (user in WIB)
 */
export function getLocalDateString(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Add (or subtract) calendar days to a YYYY-MM-DD key.
 *
 * Uses local-field arithmetic to avoid `Date.now() + n*86400000` slips across
 * DST boundaries and around midnight. Negative n subtracts.
 *
 * @example
 *   addDays("2026-02-28", 1)  // "2026-03-01"
 *   addDays("2026-03-01", -1) // "2026-02-28"
 */
export function addDays(dateKey: string, n: number): string {
    const parts = dateKey.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
        throw new Error(`addDays: invalid date key "${dateKey}"`);
    }
    const [y, m, d] = parts;
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + n);
    return getLocalDateString(dt);
}

/**
 * Format a backend ISO timestamp for display, TZ-neutral.
 *
 * The server stores wall-clock values inside ISO timestamps (Fake UTC). The
 * display should reflect the server's stored value, not re-convert for the
 * viewer's tz. We render by substring slicing — no Date parsing.
 *
 * @param iso backend ISO string like "2026-02-20T08:00:00.000Z"
 * @returns "YYYY-MM-DD HH:mm" in the stored wall-clock, or "-" for invalid
 *
 * @example
 *   formatOrderDateTime("2026-02-20T08:00:00.000Z") // "2026-02-20 08:00"
 *   formatOrderDateTime("not a date")               // "-"
 */
export function formatOrderDateTime(iso: string | Date | null | undefined): string {
    if (!iso) return '-';
    if (iso instanceof Date) {
        // Fall back to ISO for Date inputs (defensive — most callers pass string)
        iso = iso.toISOString();
    }
    if (typeof iso !== 'string') return '-';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) return '-';
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/**
 * Format a backend ISO date (date-only) for display.
 * Use for "calendar date" fields like orderDate (no time component).
 */
export function formatOrderDate(iso: string | Date | null | undefined): string {
    if (!iso) return '-';
    if (iso instanceof Date) iso = iso.toISOString();
    if (typeof iso !== 'string') return '-';
    if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return '-';
    return iso.slice(0, 10);
}

/**
 * Format a backend ISO time (time-only) for display.
 */
export function formatOrderTime(iso: string | Date | null | undefined): string {
    if (!iso) return '-';
    if (iso instanceof Date) iso = iso.toISOString();
    if (typeof iso !== 'string') return '-';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) return '-';
    return iso.slice(11, 16);
}
