import { parseDateToCateringTime, getNow } from '../services/time.service';

/**
 * Parse "YYYY-MM-DD" string to Fake-UTC midnight.
 *
 * Replaces `new Date(y, m, d, 0, 0, 0, 0)` which silently produces real-UTC.
 * Business dates must always be Fake-UTC so that a calendar date "2026-02-20"
 * maps to the same instant regardless of server timezone, matching the
 * "Shifted UTC" architecture used by getNow()/getToday()/getTomorrow().
 *
 * @returns Fake-UTC midnight Date, or null if the input is not a valid YYYY-MM-DD string
 *
 * @example
 *   parseOrderDate("2026-02-20") // Date with UTC fields = "2026-02-20 00:00:00"
 *   parseOrderDate("invalid")    // null
 */
export function parseOrderDate(s: unknown): Date | null {
    if (typeof s !== 'string') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return parseDateToCateringTime(s);
}

/**
 * Extract the YYYY-MM-DD catering calendar key from any ISO date string or Date.
 *
 * Both Fake-UTC and real-UTC ISO strings have unambiguous date prefixes
 * ("2026-02-20" is the same calendar date regardless of timezone at midnight
 * for sane timezones), so substring slice is safe.
 *
 * @param d ISO string (with or without Z) or Date
 * @returns YYYY-MM-DD string
 *
 * @example
 *   toOrderDateKey(new Date("2026-02-20T00:00:00.000Z")) // "2026-02-20"
 *   toOrderDateKey("2026-02-20T17:00:00.000Z")          // "2026-02-20"
 */
export function toOrderDateKey(d: Date | string): string {
    const iso = typeof d === 'string' ? d : d.toISOString();
    return iso.slice(0, 10);
}

/**
 * Convert a Prisma Date (real-UTC ISO with Z) to YYYY-MM-DD catering key.
 *
 * Prisma serializes DateTime columns as ISO with Z, so "2026-02-18T17:00:00.000Z"
 * represents the catering day "2026-02-18" in WIB (UTC+7) wall-clock semantics.
 * This helper extracts the YYYY-MM-DD part — note that for a Date created via
 * parseDateToCateringTime, the stored ISO is "2026-02-18T00:00:00.000Z" (UTC
 * fields hold wall-clock), so the slice correctly yields "2026-02-18".
 *
 * @example
 *   toOrderDateKeyFromPrisma(new Date("2026-02-18T17:00:00.000Z")) // "2026-02-18" (WIB: "2026-02-19 00:00")
 *   toOrderDateKeyFromPrisma(new Date("2026-02-18T00:00:00.000Z")) // "2026-02-18" (WIB: "2026-02-18 07:00")
 */
export function toOrderDateKeyFromPrisma(d: Date): string {
    return toOrderDateKey(d);
}

/**
 * Safe date parser for body input.
 *
 * Accepts both "YYYY-MM-DD" and full ISO strings. Returns null on any
 * invalid input. Caller should return 400 on null.
 *
 * For business dates, prefer parseOrderDate (Fake-UTC semantics).
 * This helper is for timestamps that need real-clock semantics
 * (e.g. "filter from this point in time").
 *
 * @example
 *   safeDateFromBody("2026-02-20")           // Date (real-UTC midnight)
 *   safeDateFromBody("2026-02-20T10:00:00Z") // Date
 *   safeDateFromBody("not a date")           // null
 *   safeDateFromBody(undefined)              // null
 */
export function safeDateFromBody(s: unknown): Date | null {
    if (typeof s !== 'string') return null;
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * True if two dates fall on the same catering calendar day.
 * Both inputs MUST be in Fake-UTC semantics (or pass through toOrderDateKey).
 *
 * @example
 *   const a = parseDateToCateringTime("2026-02-20");
 *   const b = parseDateToCateringTime("2026-02-20");
 *   isSameCateringDay(a, b) // true
 */
export function isSameCateringDay(a: Date, b: Date): boolean {
    return toOrderDateKey(a) === toOrderDateKey(b);
}

/**
 * Add (or subtract) days to a YYYY-MM-DD date key, returning a new key.
 *
 * Uses calendar arithmetic (year/month/day) to avoid DST/tz pitfalls.
 * Negative n subtracts days.
 *
 * @example
 *   addDays("2026-02-28", 1)  // "2026-03-01"
 *   addDays("2026-03-01", -1) // "2026-02-28"
 */
export function addDaysToKey(dateKey: string, n: number): string {
    const parsed = parseOrderDate(dateKey);
    if (!parsed) {
        throw new Error(`addDaysToKey: invalid date key "${dateKey}"`);
    }
    // parseOrderDate returns Fake-UTC midnight. setDate operates on Fake-UTC
    // fields which are wall-clock, so calendar math is correct.
    parsed.setUTCDate(parsed.getUTCDate() + n);
    return toOrderDateKey(parsed);
}
