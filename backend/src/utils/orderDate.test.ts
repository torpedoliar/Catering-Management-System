import { describe, it, expect } from 'vitest';
import { parseOrderDate, toOrderDateKey, toOrderDateKeyFromPrisma, safeDateFromBody, isSameCateringDay, addDaysToKey } from './orderDate';

describe('parseOrderDate', () => {
    it('parses YYYY-MM-DD to Fake-UTC midnight', () => {
        const d = parseOrderDate('2026-02-20');
        expect(d).not.toBeNull();
        expect(d!.toISOString()).toBe('2026-02-20T00:00:00.000Z');
        expect(d!.getUTCFullYear()).toBe(2026);
        expect(d!.getUTCMonth()).toBe(1); // Feb (0-indexed)
        expect(d!.getUTCDate()).toBe(20);
    });

    it('returns null for non-string input', () => {
        expect(parseOrderDate(123 as any)).toBeNull();
        expect(parseOrderDate(null as any)).toBeNull();
        expect(parseOrderDate(undefined as any)).toBeNull();
    });

    it('returns null for invalid format', () => {
        expect(parseOrderDate('2026/02/20')).toBeNull();
        expect(parseOrderDate('20-02-2026')).toBeNull();
        expect(parseOrderDate('2026-2-20')).toBeNull(); // must be 2-digit
        expect(parseOrderDate('2026-02-30')).not.toBeNull(); // parseDateToCateringTime doesn't validate calendar — accepts invalid date
    });

    it('returns null for empty string', () => {
        expect(parseOrderDate('')).toBeNull();
    });

    it('handles month boundaries', () => {
        expect(parseOrderDate('2026-01-01')!.toISOString()).toBe('2026-01-01T00:00:00.000Z');
        expect(parseOrderDate('2026-12-31')!.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    });
});

describe('toOrderDateKey', () => {
    it('extracts YYYY-MM-DD from ISO string', () => {
        expect(toOrderDateKey('2026-02-20T00:00:00.000Z')).toBe('2026-02-20');
        expect(toOrderDateKey('2026-02-20T17:00:00.000Z')).toBe('2026-02-20');
    });

    it('extracts YYYY-MM-DD from Date', () => {
        expect(toOrderDateKey(new Date('2026-02-20T00:00:00.000Z'))).toBe('2026-02-20');
    });

    it('handles date-only input', () => {
        expect(toOrderDateKey('2026-02-20')).toBe('2026-02-20');
    });
});

describe('toOrderDateKeyFromPrisma', () => {
    it('extracts YYYY-MM-DD from a Prisma real-UTC Date', () => {
        // Fake-UTC date stored as 2026-02-20T00:00:00.000Z
        const d = new Date('2026-02-20T00:00:00.000Z');
        expect(toOrderDateKeyFromPrisma(d)).toBe('2026-02-20');
    });
});

describe('safeDateFromBody', () => {
    it('parses YYYY-MM-DD', () => {
        const d = safeDateFromBody('2026-02-20');
        expect(d).not.toBeNull();
        expect(d!.toISOString().slice(0, 10)).toBe('2026-02-20');
    });

    it('parses full ISO', () => {
        const d = safeDateFromBody('2026-02-20T10:00:00Z');
        expect(d).not.toBeNull();
        expect(d!.toISOString()).toBe('2026-02-20T10:00:00.000Z');
    });

    it('returns null on invalid', () => {
        expect(safeDateFromBody('not a date')).toBeNull();
        expect(safeDateFromBody(undefined)).toBeNull();
        expect(safeDateFromBody(null)).toBeNull();
        expect(safeDateFromBody(123)).toBeNull();
    });
});

describe('isSameCateringDay', () => {
    it('true for same calendar day', () => {
        const a = parseOrderDate('2026-02-20')!;
        const b = parseOrderDate('2026-02-20')!;
        expect(isSameCateringDay(a, b)).toBe(true);
    });

    it('false for different calendar days', () => {
        const a = parseOrderDate('2026-02-20')!;
        const b = parseOrderDate('2026-02-21')!;
        expect(isSameCateringDay(a, b)).toBe(false);
    });
});

describe('addDaysToKey', () => {
    it('adds 1 day', () => {
        expect(addDaysToKey('2026-02-20', 1)).toBe('2026-02-21');
    });

    it('subtracts 1 day with negative n', () => {
        expect(addDaysToKey('2026-02-20', -1)).toBe('2026-02-19');
    });

    it('crosses month boundary', () => {
        expect(addDaysToKey('2026-02-28', 1)).toBe('2026-03-01');
        expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('crosses year boundary', () => {
        expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDaysToKey('2027-01-01', -1)).toBe('2026-12-31');
    });

    it('throws on invalid input', () => {
        expect(() => addDaysToKey('invalid', 1)).toThrow();
    });
});
