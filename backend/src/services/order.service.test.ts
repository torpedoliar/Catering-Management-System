import { describe, it, expect, vi } from 'vitest';
import { CapacityError, createOrderWithCapacityCheck } from './order.service';

const mockTx = () => {
    const tx: any = {
        canteen: { findUnique: vi.fn() },
        order: { count: vi.fn(), create: vi.fn() },
    };
    return tx;
};

describe('CapacityError', () => {
    it('is named CapacityError so the route handler can identify it via e.name', () => {
        const e = new CapacityError(50, true);
        expect(e).toBeInstanceOf(Error);
        expect(e.name).toBe('CapacityError');
        expect(e.limit).toBe(50);
        expect(e.isShiftSpecific).toBe(true);
        expect(e.message).toContain('50');
    });
});

describe('createOrderWithCapacityCheck', () => {
    const orderDate = new Date('2026-06-15T00:00:00.000Z');
    const orderData: any = {
        userId: 'u1',
        shiftId: 'shift-1',
        qrCode: 'ORDER-test',
        mealPrice: 25000,
    };

    it('skips capacity check when canteenId is null and creates directly', async () => {
        const tx = mockTx();
        tx.order.create.mockResolvedValue({ id: 'order-1' });

        const result = await createOrderWithCapacityCheck(tx, null, 'shift-1', orderDate, orderData);

        expect(result).toEqual({ id: 'order-1' });
        expect(tx.canteen.findUnique).not.toHaveBeenCalled();
        expect(tx.order.count).not.toHaveBeenCalled();
        expect(tx.order.create).toHaveBeenCalledWith({ data: { ...orderData, orderDate } });
    });

    it('skips capacity check when canteen has no limit configured', async () => {
        const tx = mockTx();
        tx.canteen.findUnique.mockResolvedValue({
            id: 'c1',
            isActive: true,
            capacity: null,
            canteenShifts: [],
        });
        tx.order.create.mockResolvedValue({ id: 'order-1' });

        const result = await createOrderWithCapacityCheck(tx, 'c1', 'shift-1', orderDate, orderData);

        expect(result.id).toBe('order-1');
        expect(tx.order.count).not.toHaveBeenCalled();
    });

    it('throws CapacityError when per-shift capacity is reached', async () => {
        const tx = mockTx();
        tx.canteen.findUnique.mockResolvedValue({
            id: 'c1',
            isActive: true,
            capacity: 100,
            canteenShifts: [{ capacity: 5, shiftId: 'shift-1' }],
        });
        tx.order.count.mockResolvedValue(5); // already at limit

        await expect(
            createOrderWithCapacityCheck(tx, 'c1', 'shift-1', orderDate, orderData)
        ).rejects.toMatchObject({ name: 'CapacityError', limit: 5, isShiftSpecific: true });
        expect(tx.order.create).not.toHaveBeenCalled();
    });

    it('throws CapacityError when daily capacity is reached', async () => {
        const tx = mockTx();
        tx.canteen.findUnique.mockResolvedValue({
            id: 'c1',
            isActive: true,
            capacity: 50,
            canteenShifts: [], // no per-shift override
        });
        tx.order.count.mockResolvedValue(50);

        await expect(
            createOrderWithCapacityCheck(tx, 'c1', 'shift-1', orderDate, orderData)
        ).rejects.toMatchObject({ name: 'CapacityError', limit: 50, isShiftSpecific: false });
    });

    it('throws when canteen is inactive', async () => {
        const tx = mockTx();
        tx.canteen.findUnique.mockResolvedValue({
            id: 'c1',
            isActive: false,
            capacity: 50,
            canteenShifts: [],
        });

        await expect(
            createOrderWithCapacityCheck(tx, 'c1', 'shift-1', orderDate, orderData)
        ).rejects.toThrow('tidak aktif');
    });

    it('throws when canteen does not exist', async () => {
        const tx = mockTx();
        tx.canteen.findUnique.mockResolvedValue(null);

        await expect(
            createOrderWithCapacityCheck(tx, 'c1', 'shift-1', orderDate, orderData)
        ).rejects.toThrow('tidak ditemukan');
    });

    it('creates the order when under the limit', async () => {
        const tx = mockTx();
        tx.canteen.findUnique.mockResolvedValue({
            id: 'c1',
            isActive: true,
            capacity: 100,
            canteenShifts: [{ capacity: 10, shiftId: 'shift-1' }],
        });
        tx.order.count.mockResolvedValue(3); // plenty of room
        tx.order.create.mockResolvedValue({ id: 'order-new' });

        const result = await createOrderWithCapacityCheck(tx, 'c1', 'shift-1', orderDate, orderData);

        expect(result.id).toBe('order-new');
        expect(tx.order.create).toHaveBeenCalledTimes(1);
    });
});
