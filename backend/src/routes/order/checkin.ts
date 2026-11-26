/**
 * Check-in Routes
 * - GET /:id/qrcode - Get QR code for an order
 * - POST /checkin/qr - Check-in by QR code (Canteen/Admin)
 * - POST /checkin/manual - Check-in by user ID/name (Canteen/Admin)
 */

import {
    Router,
    Response,
    prisma,
    QRCode,
    AuthRequest,
    authMiddleware,
    canteenMiddleware,
    sseManager,
    getNow,
    getNowUTC,
    getToday,
    getTomorrow,
    logOrder,
    getRequestContext,
    getCachedSettings,
    ErrorMessages,
    upload,
    checkinUploadDir,
    isOvernightShift,
    validateCheckinTimeWindow,
} from './shared';

import { savePickupPhoto } from './checkin.photo';
import { resolveCheckinIdentity } from './checkin.identity';

const router = Router();
const pickupInclude = {
    user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true, photo: true } },
    shift: { include: { dayBreaks: true } },
    canteen: { select: { id: true, name: true, location: true } },
} as const;

async function respondToPickupConflict(res: Response, id: string) {
    const order = await prisma.order.findUnique({ where: { id }, include: pickupInclude });
    if (order?.status !== 'PICKED_UP') return res.status(409).json({ error: 'Status pesanan berubah. Periksa pesanan sebelum mencoba lagi.' });
    return res.status(409).json({ code: 'ALREADY_PICKED_UP', error: 'Pesanan sudah di-check in sebelumnya', order, checkedInBy: order.checkedInBy, checkInTime: order.checkInTime });
}

const candidateSelect = { id: true, externalId: true, name: true, department: true } as const;
const toCandidate = ({ id, ...user }: { id: string; externalId: string; name: string; department: string | null }) => ({ userId: id, ...user });

// Counter PCs often share one login; the browser sends the operator name
// typed on that PC so the audit log still shows who recorded the pickup.
const operatorNameOf = (body: any): string | undefined => {
    const v = typeof body?.operatorName === 'string' ? body.operatorName.trim().slice(0, 40) : '';
    return v || undefined;
};

router.get('/checkin/lookup', authMiddleware, canteenMiddleware, async (req, res) => {
    const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    if (!query || query.length > 100) return res.status(400).json({ error: 'Kode atau nama tidak valid' });
    try {
        const result = await resolveCheckinIdentity(
            async () => (await prisma.user.findMany({ where: { OR: [{ externalId: query }, ...(/^\d+$/.test(query) ? [{ nik: query }] : [])] }, select: candidateSelect })).map(toCandidate),
            async () => (await prisma.user.findMany({ where: { name: { contains: query, mode: 'insensitive' } }, select: candidateSelect, orderBy: [{ name: 'asc' }, { externalId: 'asc' }], take: 10 })).map(toCandidate),
        );
        res.json(result);
    } catch (error) {
        console.error('Check-in lookup error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Get QR code for an order
router.get('/:id/qrcode', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
        });

        if (!order) {
            return res.status(404).json({ error: ErrorMessages.ORDER_NOT_FOUND });
        }

        if (order.userId !== req.user?.id && req.user?.role === 'USER') {
            return res.status(403).json({ error: ErrorMessages.FORBIDDEN });
        }

        const qrCodeImage = await QRCode.toDataURL(order.qrCode, {
            width: 300,
            margin: 2,
        });

        res.json({ qrCode: order.qrCode, qrCodeImage });
    } catch (error) {
        console.error('Get QR code error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Check-in by QR code (Canteen/Admin)
// P0 Optimized: Single write, parallel queries, cached settings, async audit
router.post('/checkin/qr', authMiddleware, canteenMiddleware, upload.single('photo'), async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const { qrCode, operatorCanteenId } = req.body;

        if (!qrCode) {
            return res.status(400).json({ error: ErrorMessages.MISSING_REQUIRED_FIELDS });
        }

        // [FIX 2 + FIX 4] Parallel fetch: order + operator user + cached settings
        const [order, checkedInByUser, settings] = await Promise.all([
            prisma.order.findUnique({
                where: { qrCode },
                include: {
                    user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true, photo: true } },
                    shift: { include: { dayBreaks: true } },
                    canteen: { select: { id: true, name: true, location: true } },
                },
            }),
            req.user ? prisma.user.findUnique({
                where: { id: req.user.id },
                select: { id: true, name: true, externalId: true }
            }) : Promise.resolve(null),
            getCachedSettings(),
        ]);

        // --- Validation (pure logic, no DB) ---
        if (!order) {
            return res.status(404).json({ error: ErrorMessages.ORDER_NOT_FOUND });
        }

        if (order.status === 'PICKED_UP') {
            return res.status(400).json({
                code: 'ALREADY_PICKED_UP',
                error: 'Pesanan sudah di-check in sebelumnya',
                order,
                checkedInBy: order.checkedInBy || 'System',
                checkInTime: order.checkInTime,
            });
        }

        if (order.status === 'CANCELLED') {
            return res.status(400).json({ error: 'Pesanan sudah dibatalkan' });
        }

        if (order.status !== 'ORDERED') {
            return res.status(400).json({ error: 'Order status invalid for check-in' });
        }

        // Canteen check-in enforcement validation
        if (settings?.enforceCanteenCheckin && operatorCanteenId) {
            if (order.canteenId && order.canteenId !== operatorCanteenId) {
                return res.status(403).json({
                    error: 'Lokasi kantin tidak sesuai',
                    message: `Pesanan ini untuk "${order.canteen?.name || 'kantin lain'}". Silakan arahkan ke kantin yang benar.`,
                    orderCanteen: order.canteen?.name,
                    orderCanteenId: order.canteen?.id
                });
            }
        }

        // Validate order date and shift time window
        const now = getNow();
        const timeValidation = validateCheckinTimeWindow(order, now);
        if (!timeValidation.valid) {
            return res.status(400).json({
                error: timeValidation.error,
                message: timeValidation.message
            });
        }

        const photo = await savePickupPhoto(req.file?.buffer, settings?.checkinPhotoEnabled === true, checkinUploadDir);

        // [FIX 1] Single atomic write — updateMany ensures race condition safety
        const checkInTime = getNowUTC();
        const updateResult = await prisma.order.updateMany({
            where: {
                id: order.id,
                status: 'ORDERED', // Atomic status check — prevents double check-in
            },
            data: {
                status: 'PICKED_UP',
                checkInTime,
                checkedInById: checkedInByUser?.id || null,
                checkedInBy: checkedInByUser?.name || 'System',
                ...(photo.reference && { checkinPhoto: photo.reference }),
            },
        });

        if (updateResult.count === 0) {
            await photo.cleanup?.();
            return await respondToPickupConflict(res, order.id);
        }

        // Fetch updated order with fresh data for response (ensures correct types for Decimal, DateTime, etc.)
        const updatedOrder = await prisma.order.findUnique({
            where: { id: order.id },
            include: {
                user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true, photo: true } },
                shift: { include: { dayBreaks: true } },
                canteen: { select: { id: true, name: true, location: true } },
            },
        });

        if (!updatedOrder) {
            throw new Error('Order disappeared after check-in');
        }

        // [FIX 3] Fire-and-forget: audit log + SSE broadcast (don't block response)
        logOrder('ORDER_CHECKIN', req.user || null, updatedOrder, context, {
            oldValue: { status: 'ORDERED' },
            metadata: { checkedInBy: checkedInByUser?.name, checkedInByExternalId: checkedInByUser?.externalId, method: 'QR', operator: operatorNameOf(req.body) },
        }).catch(err => console.error('[Audit] Failed to log QR check-in:', err));

        sseManager.broadcast('order:checkin', {
            checkInBy: req.user?.externalId || 'Admin',
            order: updatedOrder,
            timestamp: getNow().toISOString(),
        });

        res.json({
            message: 'Check-in berhasil',
            photoStatus: photo.status,
            order: updatedOrder,
            checkInTime: updatedOrder.checkInTime,
            checkInBy: req.user?.externalId || 'Admin'
        });
    } catch (error) {
        console.error('Check-in error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Check-in by user ID or name (Canteen/Admin)
// P0 Optimized: Parallel queries, cached settings, atomic write, async audit
router.post('/checkin/manual', authMiddleware, canteenMiddleware, upload.single('photo'), async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const { userId, externalId, name, nik, operatorCanteenId } = req.body;
        if (name !== undefined || [userId, externalId, nik].some(value => value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > 100))) {
            return res.status(400).json({ error: 'Pilih karyawan dari hasil pencarian atau gunakan ID/NIK yang valid' });
        }
        if (!userId && !externalId && !nik) return res.status(400).json({ error: ErrorMessages.MISSING_REQUIRED_FIELDS });

        const users = await prisma.user.findMany({
            where: userId ? { id: userId } : { OR: [...(externalId ? [{ externalId }] : []), ...(nik ? [{ nik }] : [])] },
            select: candidateSelect,
            take: 2,
        });
        if (users.length > 1) return res.status(409).json({ error: 'Kode cocok dengan lebih dari satu karyawan. Pilih karyawan terlebih dahulu.' });
        const [user] = users;

        if (!user) {
            return res.status(404).json({ error: ErrorMessages.USER_NOT_FOUND });
        }

        const today = getToday();
        const tomorrow = getTomorrow();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const now = getNow();

        console.log(`[Manual Check-in] User: ${user.externalId}, Now: ${now.toISOString()}`);

        // [FIX 2] Parallel fetch: today's order + yesterday's order
        const [todayOrder, yesterdayOrder] = await Promise.all([
            prisma.order.findFirst({
                where: {
                    userId: user.id,
                    orderDate: { gte: today, lt: tomorrow },
                    status: 'ORDERED',
                },
                include: { shift: { include: { dayBreaks: true } } },
            }),
            prisma.order.findFirst({
                where: {
                    userId: user.id,
                    orderDate: { gte: yesterday, lt: today },
                    status: 'ORDERED',
                },
                include: { shift: { include: { dayBreaks: true } } },
            }),
        ]);

        const isOrderValidForCheckin = (checkOrder: any): boolean => {
            return validateCheckinTimeWindow(checkOrder, now).valid;
        };

        let order: any = null;

        if (yesterdayOrder) {
            const isOvernight = isOvernightShift(yesterdayOrder.shift.startTime, yesterdayOrder.shift.endTime);
            if (isOvernight && isOrderValidForCheckin(yesterdayOrder)) {
                order = yesterdayOrder;
            }
        }

        if (!order && todayOrder && isOrderValidForCheckin(todayOrder)) {
            order = todayOrder;
        }

        if (!order && todayOrder) {
            order = todayOrder;
        }

        // Duplicate check-in detection
        if (!order) {
            // R3 (audit 2026-11-25): only today's pickup, or yesterday's
            // overnight shift, counts as "already picked up". Yesterday's
            // daytime meal used to be shown as a duplicate when the person
            // simply had no order today.
            const pickedUpOrders = await prisma.order.findMany({
                where: {
                    userId: user.id,
                    orderDate: { gte: yesterday, lt: tomorrow },
                    status: 'PICKED_UP',
                },
                include: {
                    user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true, photo: true } },
                    shift: true,
                    canteen: { select: { id: true, name: true, location: true } },
                },
                orderBy: { checkInTime: 'desc' },
            });
            const pickedUpOrder = pickedUpOrders.find(o => o.orderDate >= today)
                ?? pickedUpOrders.find(o => o.orderDate < today && isOvernightShift(o.shift.startTime, o.shift.endTime));

            if (pickedUpOrder) {
                return res.status(400).json({
                    code: 'ALREADY_PICKED_UP',
                    error: 'Pesanan sudah di-check in sebelumnya',
                    order: pickedUpOrder,
                    checkedInBy: pickedUpOrder.checkedInBy || 'System',
                    checkInTime: pickedUpOrder.checkInTime,
                });
            }
        }

        if (!order) {
            return res.status(404).json({ error: 'Tidak ada pesanan aktif untuk pengguna ini hari ini' });
        }

        // [FIX 2 + FIX 4] Parallel fetch: cached settings + operator user
        const [settings, checkedInByUser] = await Promise.all([
            getCachedSettings(),
            req.user ? prisma.user.findUnique({
                where: { id: req.user.id },
                select: { id: true, name: true, externalId: true }
            }) : Promise.resolve(null),
        ]);

        // Canteen check-in enforcement validation
        if (settings?.enforceCanteenCheckin && operatorCanteenId) {
            if (order.canteenId && order.canteenId !== operatorCanteenId) {
                const orderCanteen = await prisma.canteen.findUnique({
                    where: { id: order.canteenId },
                    select: { id: true, name: true }
                });
                return res.status(403).json({
                    error: 'Lokasi kantin tidak sesuai',
                    message: `Pesanan ini untuk "${orderCanteen?.name || 'kantin lain'}". Silakan arahkan ke kantin yang benar.`,
                    orderCanteen: orderCanteen?.name,
                    orderCanteenId: orderCanteen?.id
                });
            }
        }

        // Final time validation using centralized utility
        const timeValidation = validateCheckinTimeWindow(order, now);
        if (!timeValidation.valid) {
            return res.status(400).json({
                error: timeValidation.error,
                message: timeValidation.message
            });
        }

        const photo = await savePickupPhoto(req.file?.buffer, settings?.checkinPhotoEnabled === true, checkinUploadDir);

        // [BUG FIX] Atomic updateMany to prevent race condition (double check-in)
        const checkInTime = getNowUTC();
        const updateResult = await prisma.order.updateMany({
            where: {
                id: order.id,
                status: 'ORDERED', // Atomic status check — prevents double check-in
            },
            data: {
                status: 'PICKED_UP',
                checkInTime,
                checkedInById: checkedInByUser?.id || null,
                checkedInBy: checkedInByUser?.name || 'System',
                ...(photo.reference && { checkinPhoto: photo.reference }),
            },
        });

        if (updateResult.count === 0) {
            await photo.cleanup?.();
            return await respondToPickupConflict(res, order.id);
        }

        // Fetch updated order with full relations for response
        const updatedOrder = await prisma.order.findUnique({
            where: { id: order.id },
            include: {
                user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true, photo: true } },
                shift: { include: { dayBreaks: true } },
                canteen: { select: { id: true, name: true, location: true } },
            },
        });

        if (!updatedOrder) {
            throw new Error('Order disappeared after check-in');
        }

        // [BUG FIX] Add audit log (was missing in manual check-in)
        logOrder('ORDER_CHECKIN', req.user || null, updatedOrder, context, {
            oldValue: { status: 'ORDERED' },
            metadata: { checkedInBy: checkedInByUser?.name, checkedInByExternalId: checkedInByUser?.externalId, method: 'Manual', operator: operatorNameOf(req.body) },
        }).catch(err => console.error('[Audit] Failed to log manual check-in:', err));

        sseManager.broadcast('order:checkin', {
            checkInBy: req.user?.externalId || 'Admin',
            order: updatedOrder,
            timestamp: getNow().toISOString(),
        });

        res.json({
            message: 'Check-in berhasil',
            photoStatus: photo.status,
            order: updatedOrder,
            checkInTime: updatedOrder.checkInTime,
            checkInBy: checkedInByUser?.name || 'Admin',
        });
    } catch (error) {
        console.error('Manual check-in error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

export default router;
