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
router.post('/checkin/qr', authMiddleware, canteenMiddleware, upload.single('photo'), async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const { qrCode } = req.body;

        if (!qrCode) {
            return res.status(400).json({ error: ErrorMessages.MISSING_REQUIRED_FIELDS });
        }

        const order = await prisma.order.findUnique({
            where: { qrCode },
            include: {
                user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true, photo: true } },
                shift: true,
            },
        });

        if (!order) {
            return res.status(404).json({ error: ErrorMessages.ORDER_NOT_FOUND });
        }

        if (order.status === 'PICKED_UP') {
            return res.status(400).json({ error: 'Pesanan sudah di-check in sebelumnya', order });
        }

        if (order.status === 'CANCELLED') {
            return res.status(400).json({ error: 'Pesanan sudah dibatalkan' });
        }

        // Canteen check-in enforcement validation
        const { operatorCanteenId } = req.body;
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
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

        // Validate order date and shift time window using centralized utility
        const now = getNow();
        const timeValidation = validateCheckinTimeWindow(order, now);
        if (!timeValidation.valid) {
            return res.status(400).json({
                error: timeValidation.error,
                message: timeValidation.message
            });
        }

        const checkedInByUser = req.user ? await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, externalId: true }
        }) : null;

        // Process photo if uploaded
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

        const updatedOrder = await prisma.order.update({
            where: { id: order.id },
            data: {
                status: 'PICKED_UP',
                checkInTime: getNowUTC(),
                checkedInById: checkedInByUser?.id || null,
                checkedInBy: checkedInByUser?.name || 'System',
                checkinPhoto: photoUrl,
            },
            include: {
                user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true, photo: true } },
                shift: true,
            },
        });

        await logOrder('ORDER_CHECKIN', req.user || null, updatedOrder, context, {
            oldValue: { status: order.status },
            metadata: { checkedInBy: checkedInByUser?.name, checkedInByExternalId: checkedInByUser?.externalId, method: 'QR' },
        });

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
router.post('/checkin/manual', authMiddleware, canteenMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { externalId, name, nik } = req.body;

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

        let todayOrder = await prisma.order.findFirst({
            where: {
                userId: user.id,
                orderDate: { gte: today, lt: tomorrow },
                status: 'ORDERED',
            },
            include: { shift: true },
        });

        let yesterdayOrder = await prisma.order.findFirst({
            where: {
                userId: user.id,
                orderDate: { gte: yesterday, lt: today },
                status: 'ORDERED',
            },
            include: { shift: true },
        });

        const isOrderValidForCheckin = (order: any): boolean => {
            return validateCheckinTimeWindow(order, now).valid;
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

        if (!order) {
            return res.status(404).json({ error: 'Tidak ada pesanan aktif untuk pengguna ini hari ini' });
        }

        // Canteen check-in enforcement validation
        const { operatorCanteenId } = req.body;
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
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

        const checkedInByUser = req.user ? await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, externalId: true }
        }) : null;

        const updatedOrder = await prisma.order.update({
            where: { id: order.id },
            data: {
                status: 'PICKED_UP',
                checkInTime: getNowUTC(),
                checkedInById: checkedInByUser?.id || null,
                checkedInBy: checkedInByUser?.name || 'System',
            },
            include: {
                user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true, photo: true } },
                shift: true,
            },
        });

        sseManager.broadcast('order:checkin', {
            order: updatedOrder,
            timestamp: getNow().toISOString(),
        });

        res.json({ message: 'Check-in berhasil', order: updatedOrder, checkedInBy: checkedInByUser?.name });
    } catch (error) {
        console.error('Manual check-in error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

export default router;
