import { describe, expect, it } from 'vitest';
import { calculateBreakWindow } from './shift-utils';
const getShiftWindow = () => ({ start: new Date(2026, 10, 25, 22), end: new Date(2026, 10, 26, 6) });

describe('overnight check-in windows', () => {
    const day = new Date(2026, 10, 25);
    const shift = { startTime: '22:00', endTime: '06:00' };
    it('keeps a break before midnight on the order date', () => {
        const { start, end } = getShiftWindow();
        const result = calculateBreakWindow(day, { ...shift, breakStartTime: '23:00', breakEndTime: '23:45' }, start, end);
        expect(result?.breakStart).toEqual(new Date(2026, 10, 25, 23));
    });
    it('keeps both endpoints of a break after midnight on the next date', () => {
        const { start, end } = getShiftWindow();
        const result = calculateBreakWindow(day, { ...shift, breakStartTime: '00:30', breakEndTime: '01:30' }, start, end);
        expect(result?.breakEnd).toEqual(new Date(2026, 10, 26, 1, 30));
    });
});
