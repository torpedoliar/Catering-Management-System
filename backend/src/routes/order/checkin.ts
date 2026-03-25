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
    sharp,
    path,
    isOvernightShift,
    validateCheckinTimeWindow,
} from './shared';

const router = Router();

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

        // Process photo if uploaded (before DB write to have photoUrl ready)
        let photoUrl = undefined;
        if (req.file) {
            const filename = `checkin-${order.id}-${Date.now()}.webp`;
            const filepath = path.join(checkinUploadDir, filename);

            await sharp(req.file.buffer)
                .resize(400, 400, { fit: 'cover' })
                .webp({ quality: 80 })
                .toFile(filepath);

            photoUrl = `/uploads/checkins/${filename}`;
        }

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
                ...(photoUrl && { checkinPhoto: photoUrl }),
            },
        });

        if (updateResult.count === 0) {
            // Race condition: another operator checked in this order between read and write
            return res.status(400).json({
                error: 'Pesanan sudah di-check in sebelumnya',
                order,
                checkedInBy: order.checkedInBy || 'System',
                checkInTime: order.checkInTime,
            });
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
            metadata: { checkedInBy: checkedInByUser?.name, checkedInByExternalId: checkedInByUser?.externalId, method: 'QR' },
        }).catch(err => console.error('[Audit] Failed to log QR check-in:', err));

        sseManager.broadcast('order:checkin', {
            order: updatedOrder,
            timestamp: getNow().toISOString(),
        });

        res.json({
            message: 'Check-in berhasil',
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
router.post('/checkin/manual', authMiddleware, canteenMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const { externalId, name, nik, operatorCanteenId } = req.body;

        if (!externalId && !name && !nik) {
            return res.status(400).json({ error: ErrorMessages.MISSING_REQUIRED_FIELDS });
        }

        const orConditions: any[] = [];
        if (externalId) orConditions.push({ externalId });
        if (nik) orConditions.push({ nik });
        if (name) orConditions.push({ name: { contains: name, mode: 'insensitive' } });

        const user = await prisma.user.findFirst({
            where: { OR: orConditions }
        });

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
            const pickedUpOrder = await prisma.order.findFirst({
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
            });

            if (pickedUpOrder) {
                return res.status(400).json({
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
            },
        });

        if (updateResult.count === 0) {
            // Race condition: another operator checked in between read and write
            return res.status(400).json({
                error: 'Pesanan sudah di-check in sebelumnya',
                order,
                checkedInBy: order.checkedInBy || 'System',
                checkInTime: order.checkInTime,
            });
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
            metadata: { checkedInBy: checkedInByUser?.name, checkedInByExternalId: checkedInByUser?.externalId, method: 'Manual' },
        }).catch(err => console.error('[Audit] Failed to log manual check-in:', err));

        sseManager.broadcast('order:checkin', {
            order: updatedOrder,
            timestamp: getNow().toISOString(),
        });

        res.json({
            message: 'Check-in berhasil',
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
