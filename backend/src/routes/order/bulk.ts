/**
 * Bulk Order Creation Route
 * - POST /bulk - Create multiple orders with N+1 query optimization
 */

import {
    Router,
    Response,
    prisma,
    QRCode,
    uuidv4,
    AuthRequest,
    authMiddleware,
    blacklistMiddleware,
    blockVendorMiddleware,
    sseManager,
    getNow,
    getToday,
    isDateOrderableWeekly,
    logOrder,
    getRequestContext,
    ErrorMessages,
    apiRateLimitMiddleware,
    OrderService,
    validate,
    bulkOrderSchema,
    BulkOrderSuccess,
    BulkOrderFailure,
} from './shared';
import { parseOrderDate } from '../../utils/orderDate';
import { createOrderWithCapacityCheck } from '../../services/order.service';

const router = Router();

// Bulk create orders (with blacklist validation)
router.post('/bulk', authMiddleware, blockVendorMiddleware, blacklistMiddleware, apiRateLimitMiddleware('bulk-order'), validate(bulkOrderSchema), async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const { orders: orderRequests, canteenId } = req.body;
        const userId = req.user?.id;

        if (!userId || !orderRequests || !Array.isArray(orderRequests) || orderRequests.length === 0) {
            return res.status(400).json({ error: 'Orders array is required' });
        }

        // Limit bulk orders to prevent abuse
        if (orderRequests.length > 30) {
            return res.status(400).json({ error: 'Maximum 30 orders per bulk request' });
        }

        // Get settings
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        const cutoffMode = settings?.cutoffMode || 'per-shift';
        const maxOrderDaysAhead = settings?.maxOrderDaysAhead || 7;
        const cutoffDays = settings?.cutoffDays || 0;
        const cutoffHours = settings?.cutoffHours || 6;
        const today = getToday();
        const now = getNow();

        const maxDate = new Date(today);
        maxDate.setDate(maxDate.getDate() + maxOrderDaysAhead);

        const successOrders: BulkOrderSuccess[] = [];
        const failedOrders: BulkOrderFailure[] = [];

        // ========== BATCH PRE-FETCH DATA (N+1 Query Optimization) ==========

        const allParsedDates = orderRequests
            .map((o: { date: string; shiftId: string }) => {
                const parsed = parseOrderDate(o.date);
                return parsed ? { ...o, parsed } : null;
            })
            .filter((o): o is { date: string; shiftId: string; parsed: Date } => o !== null);

        if (allParsedDates.length === 0) {
            return res.status(400).json({ error: 'Tidak ada tanggal yang valid' });
        }

        const allDates = allParsedDates.map(o => o.parsed as Date);
        const allShiftIds = [...new Set(orderRequests.map((o: { shiftId: string }) => o.shiftId))];

        const minDate = allDates.length > 0
            ? new Date(Math.min(...allDates.map(d => d.getTime())))
            : today;
        const maxDateForQuery = allDates.length > 0
            ? new Date(Math.max(...allDates.map(d => d.getTime())))
            : today;
        maxDateForQuery.setDate(maxDateForQuery.getDate() + 1);

        // Batch 1: Fetch existing orders
        const existingOrders = await prisma.order.findMany({
            where: {
                userId,
                orderDate: { gte: minDate, lt: maxDateForQuery },
                status: { not: 'CANCELLED' },
            },
            select: { orderDate: true }
        });
        const existingDatesSet = new Set(
            existingOrders.map(o => o.orderDate.toISOString().split('T')[0])
        );

        // Batch 2: Fetch all holidays
        const holidays = await prisma.holiday.findMany({
            where: {
                date: { gte: minDate, lt: maxDateForQuery },
                isActive: true,
            },
            include: { shift: true }
        });
        const holidayMap = new Map<string, typeof holidays>();
        holidays.forEach(h => {
            const key = h.date.toISOString().split('T')[0];
            if (!holidayMap.has(key)) holidayMap.set(key, []);
            holidayMap.get(key)!.push(h);
        });

        // Batch 3: Fetch all shifts
        const shifts = await prisma.shift.findMany({
            where: { id: { in: allShiftIds } }
        });
        const shiftMap = new Map(shifts.map(s => [s.id, s]));

        // ========== END BATCH PRE-FETCH ==========

        for (const orderReq of orderRequests) {
            const { date: orderDateParam, shiftId } = orderReq;

            if (!orderDateParam || !shiftId) {
                failedOrders.push({
                    date: orderDateParam || 'unknown',
                    shiftId: shiftId || 'unknown',
                    reason: 'Tanggal dan shift harus diisi'
                });
                continue;
            }

            const orderDate = parseOrderDate(orderDateParam);

            if (!orderDate) {
                failedOrders.push({ date: orderDateParam, shiftId, reason: 'Format tanggal tidak valid' });
                continue;
            }

            if (orderDate < today) {
                failedOrders.push({ date: orderDateParam, shiftId, reason: 'Tidak bisa memesan untuk tanggal yang sudah lewat' });
                continue;
            }

            // Validate based on cutoff mode
            if (cutoffMode === 'weekly') {
                const weeklyCheck = isDateOrderableWeekly(orderDate, {
                    weeklyCutoffDay: settings?.weeklyCutoffDay || 5,
                    weeklyCutoffHour: settings?.weeklyCutoffHour || 17,
                    weeklyCutoffMinute: settings?.weeklyCutoffMinute || 0,
                    orderableDays: settings?.orderableDays || '1,2,3,4,5,6',
                    maxWeeksAhead: settings?.maxWeeksAhead || 1,
                });
                if (!weeklyCheck.canOrder) {
                    failedOrders.push({ date: orderDateParam, shiftId, reason: weeklyCheck.reason || 'Tanggal tidak dapat dipesan (mode mingguan)' });
                    continue;
                }
            } else {
                if (orderDate > maxDate) {
                    failedOrders.push({ date: orderDateParam, shiftId, reason: `Maksimal pemesanan ${maxOrderDaysAhead} hari ke depan` });
                    continue;
                }
            }

            // Check existing order (using cached data)
            const dateStr = orderDate.toISOString().split('T')[0];
            if (existingDatesSet.has(dateStr)) {
                failedOrders.push({ date: orderDateParam, shiftId, reason: 'Sudah ada pesanan untuk tanggal ini' });
                continue;
            }

            // Check holiday (using cached data)
            const dayHolidays = holidayMap.get(dateStr) || [];
            const matchedHoliday = dayHolidays.find(h => !h.shiftId || h.shiftId === shiftId);
            if (matchedHoliday) {
                const message = matchedHoliday.shiftId
                    ? `Libur ${matchedHoliday.shift?.name}: ${matchedHoliday.name}`
                    : `Hari libur: ${matchedHoliday.name}`;
                failedOrders.push({ date: orderDateParam, shiftId, reason: message });
                continue;
            }

            // Get shift (using cached data)
            const shift = shiftMap.get(shiftId);
            if (!shift) {
                failedOrders.push({ date: orderDateParam, shiftId, reason: 'Shift tidak ditemukan' });
                continue;
            }
            if (!shift.isActive) {
                failedOrders.push({ date: orderDateParam, shiftId, reason: 'Shift tidak aktif' });
                continue;
            }

            // Check cutoff time
            const [hours, minutes] = shift.startTime.split(':').map(Number);
            const shiftStartDateTime = new Date(orderDate);
            shiftStartDateTime.setHours(hours, minutes, 0, 0);
            const cutoffMs = (cutoffDays * 24 * 60 * 60 * 1000) + (cutoffHours * 60 * 60 * 1000);
            const cutoffDateTime = new Date(shiftStartDateTime.getTime() - cutoffMs);

            if (now >= cutoffDateTime) {
                failedOrders.push({
                    date: orderDateParam,
                    shiftId,
                    reason: `Waktu pemesanan sudah lewat (cutoff: ${cutoffDateTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})`
                });
                continue;
            }

            // Check canteen capacity
            if (canteenId) {
                const capacityCheck = await OrderService.validateCanteenCapacity(canteenId, shiftId, orderDate);
                if (!capacityCheck.valid) {
                    failedOrders.push({ date: orderDateParam, shiftId, reason: capacityCheck.message || 'Kuota kantin penuh' });
                    continue;
                }
            }

            // Create order
            try {
                const qrCodeData = `ORDER-${uuidv4()}`;
                const qrCodeImage = await QRCode.toDataURL(qrCodeData, {
                    width: 300,
                    margin: 2,
                    color: { dark: '#000000', light: '#ffffff' },
                });

                // C-R1: capacity check + create in a SERIALIZABLE transaction
                // to prevent overbooking when two bulk requests race for the
                // last slot.
                const orderData: any = {
                    userId,
                    shiftId,
                    qrCode: qrCodeData,
                    mealPrice: shift.mealPrice,
                    canteen: canteenId ? { connect: { id: canteenId } } : undefined,
                };

                let order;
                try {
                    order = await prisma.$transaction(
                        (tx) => createOrderWithCapacityCheck(tx, canteenId, shiftId, orderDate, orderData),
                        { isolationLevel: 'Serializable' }
                    );
                } catch (e: any) {
                    if (e?.name === 'CapacityError') {
                        failedOrders.push({ date: orderDateParam, shiftId, reason: 'Kapasitas kantin penuh' });
                        continue;
                    }
                    throw e;
                }

                const orderWithIncludes = await prisma.order.findUnique({
                    where: { id: order.id },
                    include: {
                        user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true, photo: true } },
                        shift: true,
                        canteen: { select: { id: true, name: true, location: true } },
                    },
                });

                await logOrder('ORDER_CREATED', req.user || null, orderWithIncludes, context);

                successOrders.push({
                    date: orderDateParam,
                    shiftId,
                    order: { ...orderWithIncludes, qrCodeImage },
                });
            } catch (err) {
                console.error(`Failed to create order for ${orderDateParam}:`, err);
                failedOrders.push({ date: orderDateParam, shiftId, reason: 'Gagal membuat pesanan' });
            }
        }

        if (successOrders.length > 0) {
            sseManager.broadcast('order:bulk_created', {
                count: successOrders.length,
                userId,
                timestamp: getNow().toISOString(),
            });
        }

        res.status(201).json({
            message: `Berhasil membuat ${successOrders.length} pesanan`,
            success: successOrders,
            failed: failedOrders,
            summary: {
                total: orderRequests.length,
                successCount: successOrders.length,
                failedCount: failedOrders.length,
            }
        });
    } catch (error) {
        console.error('Bulk create order error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

export default router;
