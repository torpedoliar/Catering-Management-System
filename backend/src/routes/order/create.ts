/**
 * Single Order Creation Route
 * - POST / - Create a single order with validation
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
    sseManager,
    getNow,
    getToday,
    isDateOrderableWeekly,
    logOrder,
    getRequestContext,
    ErrorMessages,
    formatErrorMessage,
    OrderService,
    validate,
    createOrderSchema,
} from './shared';

const router = Router();

// Create order (with blacklist validation, cutoff validated per selected date inside)
router.post('/', authMiddleware, blacklistMiddleware, validate(createOrderSchema), async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const { shiftId, orderDate: orderDateParam, canteenId } = req.body;
        const userId = req.user?.id;

        if (!userId || !shiftId) {
            return res.status(400).json({ error: ErrorMessages.MISSING_REQUIRED_FIELDS });
        }

        // Parse and validate orderDate
        let orderDate: Date;
        if (orderDateParam) {
            // Parse date string as local date (avoid UTC timezone shift)
            const dateParts = orderDateParam.split('-');
            if (dateParts.length === 3) {
                const year = parseInt(dateParts[0]);
                const month = parseInt(dateParts[1]) - 1;
                const day = parseInt(dateParts[2]);
                orderDate = new Date(year, month, day, 0, 0, 0, 0);
            } else {
                orderDate = new Date(orderDateParam);
            }
            if (isNaN(orderDate.getTime())) {
                return res.status(400).json({ error: ErrorMessages.INVALID_ORDER_DATE });
            }
        } else {
            orderDate = getToday();
        }

        orderDate.setHours(0, 0, 0, 0);

        // Check if date is in the past
        const today = getToday();
        if (orderDate < today) {
            return res.status(400).json({ error: ErrorMessages.PAST_DATE });
        }

        // Get settings to check cutoff mode and limits
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        const cutoffMode = settings?.cutoffMode || 'per-shift';
        const maxOrderDaysAhead = settings?.maxOrderDaysAhead || 7;
        const cutoffDays = settings?.cutoffDays || 0;
        const cutoffHours = settings?.cutoffHours || 6;

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
                return res.status(400).json({
                    error: weeklyCheck.reason || ErrorMessages.DATE_NOT_ORDERABLE,
                    cutoffMode: 'weekly'
                });
            }
        } else {
            // Per-shift mode
            const maxDate = new Date(today);
            maxDate.setDate(maxDate.getDate() + maxOrderDaysAhead);

            if (orderDate > maxDate) {
                return res.status(400).json({
                    error: formatErrorMessage('MAX_DAYS_EXCEEDED', { days: maxOrderDaysAhead }),
                    maxOrderDaysAhead
                });
            }
        }

        // Check if user already has an order for this date
        const nextDay = new Date(orderDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const existingOrder = await prisma.order.findFirst({
            where: {
                userId,
                orderDate: { gte: orderDate, lt: nextDay },
                status: { not: 'CANCELLED' },
            },
        });

        if (existingOrder) {
            return res.status(400).json({ error: ErrorMessages.ORDER_ALREADY_EXISTS });
        }

        // Check if the order date is a holiday
        const holidayDateStart = new Date(orderDate);
        holidayDateStart.setHours(0, 0, 0, 0);
        const holidayDateEnd = new Date(orderDate);
        holidayDateEnd.setHours(23, 59, 59, 999);

        const holiday = await prisma.holiday.findFirst({
            where: {
                date: { gte: holidayDateStart, lte: holidayDateEnd },
                isActive: true,
                OR: [
                    { shiftId: null },
                    { shiftId: shiftId }
                ]
            },
            include: { shift: true }
        });

        if (holiday) {
            const message = holiday.shiftId
                ? `Tidak dapat memesan untuk ${holiday.shift?.name}: ${holiday.name}`
                : `Tidak dapat memesan makanan pada tanggal ini: ${holiday.name}`;
            return res.status(400).json({
                error: message,
                isHoliday: true,
                holidayName: holiday.name,
                isShiftSpecific: !!holiday.shiftId
            });
        }

        // Get shift for cutoff validation
        const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
        if (!shift) {
            return res.status(404).json({ error: ErrorMessages.SHIFT_NOT_FOUND });
        }
        if (!shift.isActive) {
            return res.status(400).json({ error: ErrorMessages.SHIFT_INACTIVE });
        }

        // Calculate cutoff time for the selected date
        const [hours, minutes] = shift.startTime.split(':').map(Number);
        const shiftStartDateTime = new Date(orderDate);
        shiftStartDateTime.setHours(hours, minutes, 0, 0);

        const cutoffMs = (cutoffDays * 24 * 60 * 60 * 1000) + (cutoffHours * 60 * 60 * 1000);
        const cutoffDateTime = new Date(shiftStartDateTime.getTime() - cutoffMs);
        const now = getNow();

        if (now >= cutoffDateTime) {
            return res.status(403).json({
                error: ErrorMessages.CUTOFF_PASSED,
                message: `Pemesanan untuk ${shift.name} pada ${orderDate.toLocaleDateString('id-ID')} harus dilakukan sebelum ${cutoffDateTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })}`,
                cutoffTime: cutoffDateTime.toISOString(),
                shiftStart: shiftStartDateTime.toISOString(),
                currentTime: now.toISOString(),
            });
        }

        // Generate unique QR code
        const qrCodeData = `ORDER-${uuidv4()}`;
        const qrCodeImage = await QRCode.toDataURL(qrCodeData, {
            width: 300,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
        });

        // Check canteen capacity
        if (canteenId) {
            const capacityCheck = await OrderService.validateCanteenCapacity(canteenId, shiftId, orderDate);
            if (!capacityCheck.valid) {
                return res.status(400).json({ error: capacityCheck.message });
            }
        }

        const order = await prisma.order.create({
            data: {
                userId,
                shiftId,
                orderDate,
                qrCode: qrCodeData,
                mealPrice: shift.mealPrice,
                canteenId: canteenId || null,
            },
            include: {
                user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true, photo: true } },
                shift: true,
                canteen: { select: { id: true, name: true, location: true } },
            },
        });

        await logOrder('ORDER_CREATED', req.user || null, order, context);

        sseManager.broadcast('order:created', {
            order,
            timestamp: getNow().toISOString(),
        });

        res.status(201).json({
            ...order,
            qrCodeImage,
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

export default router;
