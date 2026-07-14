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
    blockVendorMiddleware,
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
    apiRateLimitMiddleware,
    cutoffMiddleware,
    parseDateToCateringTime,
} from './shared';
import { getCachedSettings } from '../../services/cache.service';
import { createOrderWithCapacityCheck } from '../../services/order.service';

const router = Router();

// Create order (with blacklist validation, rate limiting, cutoff validated per selected date inside)
router.post('/', authMiddleware, blockVendorMiddleware, blacklistMiddleware, apiRateLimitMiddleware('default'), cutoffMiddleware, validate(createOrderSchema), async (req: AuthRequest, res: Response) => {
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
            // FIX: Use Catering Time (Fake UTC) to ensure "2026-02-18" is always "2026-02-18T00:00:00.000Z"
            // regardless of server timezone. Matches "Shifted UTC" architecture.
            orderDate = parseDateToCateringTime(orderDateParam);

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
        const settings = await getCachedSettings();
        const cutoffMode = settings?.cutoffMode || 'per-shift';
        const maxOrderDaysAhead = settings?.maxOrderDaysAhead || 7;
        const cutoffDays = settings?.cutoffDays || 0;
        const cutoffHours = settings?.cutoffHours || 6;

        // Validate based on cutoff mode
        // Cutoff validation is now handled by cutoffMiddleware (DRY)
        // Removed duplicated weekly/per-shift logic here

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

        // FIX-L3: Use shift already fetched by cutoffMiddleware (avoids double DB query)
        const shift = (req as any).shift;
        if (!shift) {
            return res.status(404).json({ error: ErrorMessages.SHIFT_NOT_FOUND });
        }

        // Calculate cutoff time for the selected date
        // Calculate cutoff time for the selected date
        // Logic removed in favor of cutoffMiddleware
        // const [hours, minutes] = shift.startTime.split(':').map(Number);
        // ...

        // Generate unique QR code
        const qrCodeData = `ORDER-${uuidv4()}`;
        const qrCodeImage = await QRCode.toDataURL(qrCodeData, {
            width: 300,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
        });

        // C-R1: capacity check + create inside SERIALIZABLE transaction. The
        // old TOCTOU pattern (count + create as separate calls) allowed
        // concurrent requests for the last slot to both pass.
        //
        // Note: `canteenId` is a scalar column (not a relation) on Order.
        // Prisma rejects `{ canteen: { connect: { id } }` payloads with
        // "Unknown argument `canteen`. Did you mean `canteenId`?" because the
        // relation field is not exposed on the OrderCreateInput for this
        // particular model setup. Pass the FK directly.
        const orderData: any = {
            userId,
            shiftId,
            qrCode: qrCodeData,
            mealPrice: shift.mealPrice,
            canteenId: canteenId || null,
        };

        let order;
        try {
            order = await prisma.$transaction(
                (tx) => createOrderWithCapacityCheck(tx, canteenId, shiftId, orderDate, orderData),
                { isolationLevel: 'Serializable' }
            );
        } catch (e: any) {
            if (e?.name === 'CapacityError') {
                return res.status(409).json({ error: e.message, code: 'CAPACITY_FULL' });
            }
            throw e;
        }

        // Reload with includes for the response shape
        const orderWithIncludes = await prisma.order.findUnique({
            where: { id: order.id },
            include: {
                user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true, photo: true } },
                shift: true,
                canteen: { select: { id: true, name: true, location: true } },
            },
        });

        await logOrder('ORDER_CREATED', req.user || null, orderWithIncludes, context);

        sseManager.broadcast('order:created', {
            order: orderWithIncludes,
            timestamp: getNow().toISOString(),
        });

        res.status(201).json({
            ...orderWithIncludes,
            qrCodeImage,
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

export default router;
