import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import ExcelJS from 'exceljs';
import { AuthRequest, authMiddleware, adminMiddleware, canteenMiddleware } from '../middleware/auth.middleware';
import { cutoffMiddleware } from '../middleware/cutoff.middleware';
import { blacklistMiddleware } from '../middleware/blacklist.middleware';
import { sseManager } from '../controllers/sse.controller';
import { getNow, getToday, getTomorrow, isPastCutoff, isPastCutoffForDate } from '../services/time.service';
import { logOrder, getRequestContext } from '../services/audit.service';
import { ErrorMessages, formatErrorMessage } from '../utils/errorMessages';

const router = Router();
const prisma = new PrismaClient();

// Get user's orders
router.get('/my-orders', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { status, startDate, endDate, page = '1', limit = '20' } = req.query;

        const where: any = { userId: req.user?.id };

        if (status) where.status = status;
        if (startDate || endDate) {
            where.orderDate = {};
            if (startDate) where.orderDate.gte = new Date(startDate as string);
            if (endDate) where.orderDate.lte = new Date(endDate as string);
        }

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: { shift: true },
                orderBy: { orderDate: 'desc' },
                skip,
                take: parseInt(limit as string),
            }),
            prisma.order.count({ where }),
        ]);

        res.json({
            orders,
            pagination: {
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                total,
                totalPages: Math.ceil(total / parseInt(limit as string)),
            },
        });
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Get order for specific date (defaults to today) for current user
router.get('/today', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        let queryDate: Date;

        // Check if date parameter is provided
        if (req.query.date) {
            queryDate = new Date(req.query.date as string);
            if (isNaN(queryDate.getTime())) {
                return res.status(400).json({ error: ErrorMessages.INVALID_ORDER_DATE });
            }
            queryDate.setHours(0, 0, 0, 0);
        } else {
            queryDate = getToday();
        }

        const nextDay = new Date(queryDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const order = await prisma.order.findFirst({
            where: {
                userId: req.user?.id,
                orderDate: {
                    gte: queryDate,
                    lt: nextDay,
                },
                status: { not: 'CANCELLED' },
            },
            include: { shift: true },
        });

        res.json({ order });
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Create order (with blacklist validation, cutoff validated per selected date inside)
router.post('/', authMiddleware, blacklistMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const { shiftId, orderDate: orderDateParam } = req.body;
        const userId = req.user?.id;

        if (!userId || !shiftId) {
            return res.status(400).json({ error: ErrorMessages.MISSING_REQUIRED_FIELDS });
        }

        // Parse and validate orderDate
        let orderDate: Date;
        if (orderDateParam) {
            // Parse date string as local date (avoid UTC timezone shift)
            // "2025-12-08" should become Dec 8 at 00:00 LOCAL, not UTC
            const dateParts = orderDateParam.split('-');
            if (dateParts.length === 3) {
                const year = parseInt(dateParts[0]);
                const month = parseInt(dateParts[1]) - 1; // JS months are 0-indexed
                const day = parseInt(dateParts[2]);
                orderDate = new Date(year, month, day, 0, 0, 0, 0);
            } else {
                orderDate = new Date(orderDateParam);
            }
            // Validate it's a valid date
            if (isNaN(orderDate.getTime())) {
                return res.status(400).json({ error: ErrorMessages.INVALID_ORDER_DATE });
            }
        } else {
            orderDate = getToday();
        }

        // Normalize to start of day (redundant but safe)
        orderDate.setHours(0, 0, 0, 0);

        // Check if date is in the past
        const today = getToday();
        if (orderDate < today) {
            return res.status(400).json({ error: ErrorMessages.PAST_DATE });
        }

        // Get settings to check maxOrderDaysAhead
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        const maxOrderDaysAhead = settings?.maxOrderDaysAhead || 7;
        const cutoffHours = settings?.cutoffHours || 6;

        // Calculate max allowed date
        const maxDate = new Date(today);
        maxDate.setDate(maxDate.getDate() + maxOrderDaysAhead);

        if (orderDate > maxDate) {
            return res.status(400).json({
                error: formatErrorMessage('MAX_DAYS_EXCEEDED', { days: maxOrderDaysAhead }),
                maxOrderDaysAhead
            });
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

        // Check if the order date is a holiday (fullday or for this specific shift)
        // Use date range to check for holidays on the same day (ignore time)
        const holidayDateStart = new Date(orderDate);
        holidayDateStart.setHours(0, 0, 0, 0);
        const holidayDateEnd = new Date(orderDate);
        holidayDateEnd.setHours(23, 59, 59, 999);

        const holiday = await prisma.holiday.findFirst({
            where: {
                date: {
                    gte: holidayDateStart,
                    lte: holidayDateEnd
                },
                isActive: true,
                OR: [
                    { shiftId: null }, // Fullday holiday
                    { shiftId: shiftId } // Holiday for this specific shift
                ]
            },
            include: {
                shift: true
            }
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

        const cutoffDateTime = new Date(shiftStartDateTime.getTime() - (cutoffHours * 60 * 60 * 1000));
        const now = getNow();

        // Check if we're past the cutoff for this date's shift
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

        const order = await prisma.order.create({
            data: {
                userId,
                shiftId,
                orderDate,
                qrCode: qrCodeData,
            },
            include: {
                user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true } },
                shift: true,
            },
        });

        // Log order creation
        await logOrder('ORDER_CREATED', req.user || null, order, context);

        // Broadcast to all clients
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

// Get QR code for an order
router.get('/:id/qrcode', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
        });

        if (!order) {
            return res.status(404).json({ error: ErrorMessages.ORDER_NOT_FOUND });
        }

        // Check if user owns this order or is admin/canteen
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
router.post('/checkin/qr', authMiddleware, canteenMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const { qrCode } = req.body;

        if (!qrCode) {
            return res.status(400).json({ error: ErrorMessages.MISSING_REQUIRED_FIELDS });
        }

        const order = await prisma.order.findUnique({
            where: { qrCode },
            include: {
                user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true } },
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

        // Validate order date and shift time window
        const now = getNow();
        const orderDate = new Date(order.orderDate);
        orderDate.setHours(0, 0, 0, 0);

        const [startHour, startMinute] = order.shift.startTime.split(':').map(Number);
        const [endHour, endMinute] = order.shift.endTime.split(':').map(Number);

        // Build shift start/end based on order date
        const shiftStart = new Date(orderDate);
        shiftStart.setHours(startHour, startMinute, 0, 0);

        const shiftEnd = new Date(orderDate);
        shiftEnd.setHours(endHour, endMinute, 0, 0);

        // Handle overnight shifts (e.g., 23:00 - 05:00)
        if (shiftEnd <= shiftStart) {
            shiftEnd.setDate(shiftEnd.getDate() + 1);
        }

        // Allow checkin 30 mins before start until end
        const allowedStart = new Date(shiftStart.getTime() - 30 * 60000);

        if (now < allowedStart) {
            return res.status(400).json({
                error: 'Terlalu dini untuk check-in',
                message: `Check-in dimulai pada ${allowedStart.toLocaleTimeString('id-ID')}`
            });
        }

        if (now > shiftEnd) {
            return res.status(400).json({
                error: 'Waktu check-in sudah lewat',
                message: `Check-in berakhir pada ${shiftEnd.toLocaleTimeString('id-ID')}`
            });
        }

        // Get admin/canteen staff name
        const checkedInByUser = req.user ? await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, externalId: true }
        }) : null;

        const updatedOrder = await prisma.order.update({
            where: { id: order.id },
            data: {
                status: 'PICKED_UP',
                checkInTime: getNow(),
                checkedInById: checkedInByUser?.id || null,
                checkedInBy: checkedInByUser?.name || 'System',
            },
            include: {
                user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true } },
                shift: true,
            },
        });

        // Log checkin
        await logOrder('ORDER_CHECKIN', req.user || null, updatedOrder, context, {
            oldValue: { status: order.status },
            metadata: { checkedInBy: checkedInByUser?.name, checkedInByExternalId: checkedInByUser?.externalId, method: 'QR' },
        });

        // Broadcast check-in to all clients
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
        const { externalId, name } = req.body;

        if (!externalId && !name) {
            return res.status(400).json({ error: ErrorMessages.MISSING_REQUIRED_FIELDS });
        }

        // Find user
        const user = await prisma.user.findFirst({
            where: externalId
                ? { externalId }
                : { name: { contains: name, mode: 'insensitive' } },
        });

        if (!user) {
            return res.status(404).json({ error: ErrorMessages.USER_NOT_FOUND });
        }

        // Find today's order for this user
        const today = getToday();
        const tomorrow = getTomorrow();

        const order = await prisma.order.findFirst({
            where: {
                userId: user.id,
                orderDate: { gte: today, lt: tomorrow },
                status: 'ORDERED',
            },
            include: { shift: true },
        });

        if (!order) {
            return res.status(404).json({ error: 'Tidak ada pesanan aktif untuk pengguna ini hari ini' });
        }

        // Validate order date and shift time window
        const now = getNow();
        const orderDate = new Date(order.orderDate);
        orderDate.setHours(0, 0, 0, 0);

        const [startHour, startMinute] = order.shift.startTime.split(':').map(Number);
        const [endHour, endMinute] = order.shift.endTime.split(':').map(Number);

        // Build shift start/end based on order date
        const shiftStart = new Date(orderDate);
        shiftStart.setHours(startHour, startMinute, 0, 0);

        const shiftEnd = new Date(orderDate);
        shiftEnd.setHours(endHour, endMinute, 0, 0);

        // Handle overnight shifts (e.g., 23:00 - 05:00)
        if (shiftEnd <= shiftStart) {
            shiftEnd.setDate(shiftEnd.getDate() + 1);
        }

        const allowedStart = new Date(shiftStart.getTime() - 30 * 60000);

        if (now < allowedStart) {
            return res.status(400).json({
                error: 'Too early for check-in',
                message: `Check-in starts at ${allowedStart.toLocaleTimeString()}`
            });
        }

        if (now > shiftEnd) {
            return res.status(400).json({
                error: 'Check-in time has passed',
                message: `Check-in ended at ${shiftEnd.toLocaleTimeString()}`
            });
        }

        // Get admin/canteen staff name
        const checkedInByUser = req.user ? await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, externalId: true }
        }) : null;

        const updatedOrder = await prisma.order.update({
            where: { id: order.id },
            data: {
                status: 'PICKED_UP',
                checkInTime: getNow(),
                checkedInById: checkedInByUser?.id || null,
                checkedInBy: checkedInByUser?.name || 'System',
            },
            include: {
                user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true } },
                shift: true,
            },
        });

        // Broadcast check-in to all clients
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

// Cancel order
router.post('/:id/cancel', authMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const order = await prisma.order.findUnique({
            where: { id: req.params.id },
            include: { shift: true },
        });

        if (!order) {
            return res.status(404).json({ error: ErrorMessages.ORDER_NOT_FOUND });
        }

        if (order.userId !== req.user?.id && req.user?.role === 'USER') {
            return res.status(403).json({ error: ErrorMessages.FORBIDDEN });
        }

        if (order.status !== 'ORDERED') {
            return res.status(400).json({ error: ErrorMessages.CANNOT_CANCEL_PICKED_UP });
        }

        // Check cutoff time - can only cancel BEFORE cutoff
        // Use isPastCutoffForDate to properly check against the ORDER DATE, not today
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        const cutoffHours = settings?.cutoffHours || 6;
        const cutoffInfo = isPastCutoffForDate(order.orderDate, order.shift.startTime, cutoffHours);

        console.log(`[Cancel] Order ${order.id} for ${order.orderDate.toISOString().split('T')[0]}, Shift ${order.shift.name}, Cutoff: ${cutoffInfo.cutoffTime.toISOString()}, Now: ${cutoffInfo.now.toISOString()}, IsPast: ${cutoffInfo.isPast}`);

        if (cutoffInfo.isPast) {
            return res.status(400).json({
                error: ErrorMessages.CANNOT_CANCEL_PAST_CUTOFF,
                canCancel: false
            });
        }

        // Get canceller info
        const cancelledByUser = req.user ? await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, externalId: true }
        }) : null;

        const cancelReason = req.body.reason || (req.user?.role === 'USER' ? 'Dibatalkan oleh user' : 'Dibatalkan oleh admin');

        const updatedOrder = await prisma.order.update({
            where: { id: order.id },
            data: {
                status: 'CANCELLED',
                cancelledById: cancelledByUser?.id || null,
                cancelledBy: cancelledByUser?.name || 'System',
                cancelReason: cancelReason,
            },
            include: {
                user: { select: { id: true, name: true, externalId: true } },
                shift: true,
            },
        });

        // Log order cancellation
        await logOrder('ORDER_CANCELLED', req.user || null, updatedOrder, context, {
            oldValue: { status: order.status },
            metadata: { cancelledBy: cancelledByUser?.name, cancelReason },
        });

        sseManager.broadcast('order:cancelled', {
            order: updatedOrder,
            timestamp: getNow().toISOString(),
        });

        res.json({ message: 'Order cancelled', order: updatedOrder });
    } catch (error) {
        console.error('Cancel order error:', error);
        res.status(500).json({ error: 'Failed to cancel order' });
    }
});

// Get all orders (Admin only)
router.get('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { status, shiftId, startDate, endDate, search, page = '1', limit = '50' } = req.query;

        const where: any = {};

        if (status) where.status = status;
        if (shiftId) where.shiftId = shiftId;
        if (startDate || endDate) {
            where.orderDate = {};
            if (startDate) where.orderDate.gte = new Date(startDate as string);
            if (endDate) where.orderDate.lte = new Date(endDate as string);
        }
        if (search) {
            where.user = {
                OR: [
                    { name: { contains: search as string, mode: 'insensitive' } },
                    { externalId: { contains: search as string, mode: 'insensitive' } },
                ],
            };
        }

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    user: { select: { id: true, name: true, externalId: true, company: true, division: true, department: true } },
                    shift: true,
                },
                orderBy: { orderDate: 'desc' },
                skip,
                take: parseInt(limit as string),
            }),
            prisma.order.count({ where }),
        ]);

        res.json({
            orders,
            pagination: {
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                total,
                totalPages: Math.ceil(total / parseInt(limit as string)),
            },
        });
    } catch (error) {
        console.error('Get all orders error:', error);
        res.status(500).json({ error: 'Failed to get orders' });
    }
});

// Process no-shows (Admin only) - run at end of day
router.post('/process-noshows', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const now = getNow();
        const today = getToday();
        const tomorrow = getTomorrow();

        // Find all orders that weren't picked up (include shift to check end time)
        const pendingOrders = await prisma.order.findMany({
            where: {
                orderDate: { gte: new Date(today.getTime() - 24 * 60 * 60 * 1000), lt: tomorrow }, // Include yesterday for overnight shifts
                status: 'ORDERED',
            },
            include: { user: true, shift: true },
        });

        // Filter orders where the shift has actually ended
        const noShowOrders = pendingOrders.filter(order => {
            const orderDate = new Date(order.orderDate);
            orderDate.setHours(0, 0, 0, 0);
            
            // Parse shift end time
            const [endHours, endMinutes] = order.shift.endTime.split(':').map(Number);
            const [startHours] = order.shift.startTime.split(':').map(Number);
            
            // Calculate when the shift actually ends
            let shiftEndTime = new Date(orderDate);
            shiftEndTime.setHours(endHours, endMinutes, 0, 0);
            
            // If end time is less than start time, shift ends next day (overnight shift like 23:00 - 07:00)
            if (endHours < startHours) {
                shiftEndTime.setDate(shiftEndTime.getDate() + 1);
            }
            
            // Only mark as no-show if current time is past shift end time
            const isPastShiftEnd = now > shiftEndTime;
            
            if (!isPastShiftEnd) {
                console.log(`[NoShow] Skipping order ${order.id} - Shift ${order.shift.name} ends at ${shiftEndTime.toISOString()}, current time: ${now.toISOString()}`);
            }
            
            return isPastShiftEnd;
        });

        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        const strikeThreshold = settings?.blacklistStrikes || 3;
        const blacklistDuration = settings?.blacklistDuration || 7;

        const results = { processed: 0, blacklisted: [] as string[] };

        for (const order of noShowOrders) {
            // Mark as no-show
            await prisma.order.update({
                where: { id: order.id },
                data: { status: 'NO_SHOW' },
            });

            // Increment user's no-show count
            const updatedUser = await prisma.user.update({
                where: { id: order.userId },
                data: { noShowCount: { increment: 1 } },
            });

            results.processed++;

            // Check if user should be blacklisted
            if (updatedUser.noShowCount >= strikeThreshold) {
                // Check if already blacklisted
                const existingBlacklist = await prisma.blacklist.findFirst({
                    where: { userId: order.userId, isActive: true },
                });

                if (!existingBlacklist) {
                    const endDate = getNow();
                    endDate.setDate(endDate.getDate() + blacklistDuration);

                    await prisma.blacklist.create({
                        data: {
                            userId: order.userId,
                            reason: `Accumulated ${updatedUser.noShowCount} no-shows`,
                            endDate,
                        },
                    });

                    results.blacklisted.push(updatedUser.externalId);

                    // Broadcast blacklist event
                    sseManager.broadcast('user:blacklisted', {
                        userId: order.userId,
                        userName: updatedUser.name,
                        noShowCount: updatedUser.noShowCount,
                        timestamp: getNow().toISOString(),
                    });
                }
            }

            // Broadcast no-show event
            sseManager.broadcast('order:noshow', {
                orderId: order.id,
                userId: order.userId,
                userName: order.user.name,
                noShowCount: order.user.noShowCount + 1,
                timestamp: getNow().toISOString(),
            });
        }

        res.json({
            message: `Processed ${results.processed} no-shows`,
            results,
        });
    } catch (error) {
        console.error('Process no-shows error:', error);
        res.status(500).json({ error: 'Failed to process no-shows' });
    }
});

// Export transactions (Admin only)
router.get('/export', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { startDate, endDate, status } = req.query;

        const where: any = {};
        if (startDate || endDate) {
            where.orderDate = {};
            if (startDate) where.orderDate.gte = new Date(startDate as string);
            if (endDate) where.orderDate.lte = new Date(endDate as string);
        }
        if (status) where.status = status;

        const orders = await prisma.order.findMany({
            where,
            include: {
                user: true,
                shift: true,
            },
            orderBy: [{ orderDate: 'desc' }, { orderTime: 'desc' }],
        });

        // Get all canteen/admin users who processed check-ins
        const checkedInByIds = [...new Set(orders.map(o => o.checkedInById).filter(Boolean))] as string[];
        const canteenUsersMap = new Map<string, { name: string; externalId: string }>();
        
        if (checkedInByIds.length > 0) {
            const canteenUsers = await prisma.user.findMany({
                where: { id: { in: checkedInByIds } },
                select: { id: true, name: true, externalId: true }
            });
            canteenUsers.forEach(u => canteenUsersMap.set(u.id, { name: u.name, externalId: u.externalId }));
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Catering Management System';
        workbook.created = getNow();

        const worksheet = workbook.addWorksheet('Transaksi', {
            properties: { tabColor: { argb: '667eea' } },
            views: [{ state: 'frozen', xSplit: 0, ySplit: 3 }]
        });

        // Title Row
        worksheet.mergeCells('A1:Q1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'LAPORAN DETAIL TRANSAKSI CATERING';
        titleCell.font = { bold: true, size: 16, color: { argb: 'FF333333' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(1).height = 30;

        // Info Row
        worksheet.mergeCells('A2:Q2');
        const infoCell = worksheet.getCell('A2');
        const dateRange = startDate && endDate 
            ? `Periode: ${new Date(startDate as string).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} - ${new Date(endDate as string).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
            : `Diekspor: ${getNow().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
        infoCell.value = `${dateRange} | Total: ${orders.length} transaksi`;
        infoCell.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
        infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(2).height = 20;

        // Header Row - More detailed columns
        const headers = [
            { header: 'No', key: 'no', width: 6 },
            { header: 'ID Karyawan', key: 'externalId', width: 14 },
            { header: 'Nama Karyawan', key: 'name', width: 25 },
            { header: 'Perusahaan', key: 'company', width: 18 },
            { header: 'Divisi', key: 'division', width: 18 },
            { header: 'Departemen', key: 'department', width: 18 },
            { header: 'Shift', key: 'shift', width: 14 },
            { header: 'Jam Shift', key: 'shiftTime', width: 14 },
            { header: 'Tanggal Order', key: 'orderDate', width: 18 },
            { header: 'Jam Order', key: 'orderTime', width: 12 },
            { header: 'Status', key: 'status', width: 16 },
            { header: 'Tanggal Ambil', key: 'checkInDate', width: 18 },
            { header: 'Jam Ambil', key: 'checkInTime', width: 12 },
            { header: 'Diambil di Canteen', key: 'canteenLocation', width: 20 },
            { header: 'Diproses Oleh', key: 'processedBy', width: 22 },
            { header: 'Alasan Batal', key: 'cancelReason', width: 25 },
            { header: 'Keterangan', key: 'notes', width: 20 },
        ];

        worksheet.columns = headers;

        // Style header row (row 3)
        const headerRow = worksheet.getRow(3);
        headerRow.values = headers.map(h => h.header);
        headerRow.height = 25;
        headerRow.eachCell((cell, colNumber) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF667eea' }
            };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF444444' } },
                bottom: { style: 'thin', color: { argb: 'FF444444' } },
                left: { style: 'thin', color: { argb: 'FF444444' } },
                right: { style: 'thin', color: { argb: 'FF444444' } }
            };
        });

        // Status labels
        const statusLabels: Record<string, string> = {
            'ORDERED': 'Menunggu',
            'PICKED_UP': 'Sudah Diambil',
            'NO_SHOW': 'Tidak Diambil',
            'CANCELLED': 'Dibatalkan'
        };

        // Status colors
        const statusColors: Record<string, string> = {
            'ORDERED': 'FFF59E0B',     // Yellow
            'PICKED_UP': 'FF10B981',   // Green
            'NO_SHOW': 'FFEF4444',     // Red
            'CANCELLED': 'FF6B7280'    // Gray
        };

        // Add data rows
        orders.forEach((order, index) => {
            // Determine who processed this order and canteen location
            let processedBy = '-';
            let canteenLocation = '-';
            
            if (order.status === 'PICKED_UP' && order.checkedInById) {
                const canteenUser = canteenUsersMap.get(order.checkedInById);
                if (canteenUser) {
                    canteenLocation = `Canteen ${canteenUser.externalId}`;
                    processedBy = canteenUser.name;
                } else if (order.checkedInBy) {
                    processedBy = order.checkedInBy;
                    canteenLocation = 'Canteen';
                }
            } else if (order.status === 'CANCELLED' && order.cancelledBy) {
                processedBy = order.cancelledBy;
            } else if (order.status === 'NO_SHOW') {
                processedBy = 'Sistem (Auto No-Show)';
            }

            // Generate notes based on status
            let notes = '';
            if (order.status === 'NO_SHOW') {
                notes = 'Tidak mengambil makanan - Pelanggaran';
            } else if (order.status === 'CANCELLED') {
                notes = 'Pesanan dibatalkan';
            } else if (order.status === 'PICKED_UP') {
                notes = 'Makanan telah diambil';
            } else if (order.status === 'ORDERED') {
                notes = 'Menunggu pengambilan';
            }

            const row = worksheet.addRow({
                no: index + 1,
                externalId: order.user.externalId,
                name: order.user.name,
                company: order.user.company || '-',
                division: order.user.division || '-',
                department: order.user.department || '-',
                shift: order.shift.name,
                shiftTime: `${order.shift.startTime} - ${order.shift.endTime}`,
                orderDate: order.orderDate.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
                orderTime: order.orderTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                status: statusLabels[order.status] || order.status,
                checkInDate: order.checkInTime ? order.checkInTime.toLocaleDateString('id-ID', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '-',
                checkInTime: order.checkInTime ? order.checkInTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-',
                canteenLocation: canteenLocation,
                processedBy: processedBy,
                cancelReason: order.cancelReason || '-',
                notes: notes
            });

            // Alternate row colors
            const bgColor = index % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF';
            row.eachCell((cell, colNumber) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: bgColor }
                };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                };
                cell.alignment = { vertical: 'middle' };

                // Center alignment for specific columns (No, Shift, ShiftTime, Order Time, Status, CheckIn Date/Time, Canteen)
                if ([1, 7, 8, 10, 11, 12, 13, 14].includes(colNumber)) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                }
            });

            // Color status cell (column 11)
            const statusCell = row.getCell(11);
            statusCell.font = { bold: true, color: { argb: statusColors[order.status] || 'FF333333' } };
        });

        // Summary section
        const summaryStartRow = worksheet.rowCount + 2;
        
        worksheet.mergeCells(`A${summaryStartRow}:D${summaryStartRow}`);
        const summaryTitle = worksheet.getCell(`A${summaryStartRow}`);
        summaryTitle.value = 'RINGKASAN LAPORAN';
        summaryTitle.font = { bold: true, size: 12, color: { argb: 'FF333333' } };
        summaryTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667eea' } };
        summaryTitle.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };

        const stats = {
            total: orders.length,
            pickedUp: orders.filter(o => o.status === 'PICKED_UP').length,
            pending: orders.filter(o => o.status === 'ORDERED').length,
            noShow: orders.filter(o => o.status === 'NO_SHOW').length,
            cancelled: orders.filter(o => o.status === 'CANCELLED').length
        };

        const summaryData = [
            ['Total Transaksi', stats.total, '', ''],
            ['Sudah Diambil (PICKED_UP)', stats.pickedUp, stats.total > 0 ? `${Math.round((stats.pickedUp / stats.total) * 100)}%` : '0%', 'dari total'],
            ['Menunggu (ORDERED)', stats.pending, stats.total > 0 ? `${Math.round((stats.pending / stats.total) * 100)}%` : '0%', 'dari total'],
            ['Tidak Diambil (NO_SHOW)', stats.noShow, stats.total > 0 ? `${Math.round((stats.noShow / stats.total) * 100)}%` : '0%', 'Pelanggaran'],
            ['Dibatalkan (CANCELLED)', stats.cancelled, stats.total > 0 ? `${Math.round((stats.cancelled / stats.total) * 100)}%` : '0%', 'dari total'],
            ['', '', '', ''],
            ['Tingkat Keberhasilan', `${stats.total > 0 ? Math.round((stats.pickedUp / stats.total) * 100) : 0}%`, 'dari seluruh pesanan', ''],
        ];

        summaryData.forEach((item, idx) => {
            const row = worksheet.getRow(summaryStartRow + 1 + idx);
            row.getCell(1).value = item[0];
            row.getCell(2).value = item[1];
            row.getCell(3).value = item[2];
            row.getCell(4).value = item[3];
            row.getCell(1).font = { color: { argb: 'FF333333' } };
            row.getCell(2).font = { bold: true, color: { argb: 'FF333333' } };
            row.getCell(3).font = { italic: true, color: { argb: 'FF666666' } };
            row.getCell(4).font = { color: { argb: 'FF666666' } };
        });

        const filename = `Transaksi_Catering_${getNow().toISOString().split('T')[0]}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export transactions' });
    }
});

// Get order statistics (Admin only) - Enhanced with company, department, and risk users
router.get('/stats/today', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const today = getToday();
        const tomorrow = getTomorrow();

        // Get settings for blacklist threshold
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
        const blacklistStrikes = settings?.blacklistStrikes || 3;

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const [total, pickedUp, pending, cancelled, noShow, byShift, shifts, todayHolidays, blacklistedCount, usersAtRisk, ordersWithDetails, todayNoShowOrders, yesterdayNoShowOrders] = await Promise.all([
            prisma.order.count({
                where: { orderDate: { gte: today, lt: tomorrow } },
            }),
            prisma.order.count({
                where: { orderDate: { gte: today, lt: tomorrow }, status: 'PICKED_UP' },
            }),
            prisma.order.count({
                where: { orderDate: { gte: today, lt: tomorrow }, status: 'ORDERED' },
            }),
            prisma.order.count({
                where: { orderDate: { gte: today, lt: tomorrow }, status: 'CANCELLED' },
            }),
            prisma.order.count({
                where: { orderDate: { gte: today, lt: tomorrow }, status: 'NO_SHOW' },
            }),
            prisma.order.groupBy({
                by: ['shiftId'],
                where: { orderDate: { gte: today, lt: tomorrow } },
                _count: { id: true },
            }),
            prisma.shift.findMany({ where: { isActive: true } }),
            prisma.holiday.findMany({
                where: {
                    date: { gte: today, lt: tomorrow },
                    isActive: true,
                },
                include: { shift: true },
            }),
            prisma.blacklist.count({
                where: { isActive: true, OR: [{ endDate: null }, { endDate: { gt: getNow() } }] },
            }),
            prisma.user.findMany({
                where: {
                    noShowCount: { gte: blacklistStrikes - 1, lt: blacklistStrikes },
                    isActive: true,
                },
                select: { id: true, externalId: true, name: true, company: true, department: true, noShowCount: true },
                take: 10,
            }),
            prisma.order.findMany({
                where: { orderDate: { gte: today, lt: tomorrow } },
                include: {
                    user: { select: { company: true, department: true } },
                    shift: { select: { name: true } }
                },
            }),
            // Today's no-show orders with user details
            prisma.order.findMany({
                where: {
                    orderDate: { gte: today, lt: tomorrow },
                    status: 'NO_SHOW'
                },
                include: {
                    user: { select: { id: true, externalId: true, name: true, company: true, department: true, noShowCount: true } },
                    shift: { select: { name: true } }
                },
            }),
            // Yesterday's no-show orders with user details
            prisma.order.findMany({
                where: {
                    orderDate: { gte: yesterday, lt: today },
                    status: 'NO_SHOW'
                },
                include: {
                    user: { select: { id: true, externalId: true, name: true, company: true, department: true, noShowCount: true } },
                    shift: { select: { name: true } }
                },
            }),
        ]);

        // Calculate stats by company (filter out empty/null values)
        const companyStats: Record<string, { total: number; pickedUp: number; pending: number }> = {};
        const departmentStats: Record<string, {
            total: number;
            pickedUp: number;
            pending: number;
            byShift: Record<string, { total: number; pickedUp: number; noShow: number }>;
        }> = {};
        const companyShiftStats: Record<string, Record<string, { total: number; pickedUp: number; noShow: number }>> = {};

        ordersWithDetails.forEach((order) => {
            const company = order.user.company?.trim();
            const dept = order.user.department?.trim();
            const shiftName = order.shift?.name || 'Unknown';

            // Only count if company has a value
            if (company && company.length > 0) {
                if (!companyStats[company]) {
                    companyStats[company] = { total: 0, pickedUp: 0, pending: 0 };
                }
                companyStats[company].total++;
                if (order.status === 'PICKED_UP') companyStats[company].pickedUp++;
                if (order.status === 'ORDERED') companyStats[company].pending++;

                // Company-Shift breakdown
                if (!companyShiftStats[company]) {
                    companyShiftStats[company] = {};
                }
                if (!companyShiftStats[company][shiftName]) {
                    companyShiftStats[company][shiftName] = { total: 0, pickedUp: 0, noShow: 0 };
                }
                companyShiftStats[company][shiftName].total++;
                if (order.status === 'PICKED_UP') companyShiftStats[company][shiftName].pickedUp++;
                if (order.status === 'NO_SHOW') companyShiftStats[company][shiftName].noShow++;
            }

            // Only count if department has a value
            if (dept && dept.length > 0) {
                if (!departmentStats[dept]) {
                    departmentStats[dept] = { total: 0, pickedUp: 0, pending: 0, byShift: {} };
                }
                departmentStats[dept].total++;
                if (order.status === 'PICKED_UP') departmentStats[dept].pickedUp++;
                if (order.status === 'ORDERED') departmentStats[dept].pending++;

                // Department-Shift breakdown
                if (!departmentStats[dept].byShift[shiftName]) {
                    departmentStats[dept].byShift[shiftName] = { total: 0, pickedUp: 0, noShow: 0 };
                }
                departmentStats[dept].byShift[shiftName].total++;
                if (order.status === 'PICKED_UP') departmentStats[dept].byShift[shiftName].pickedUp++;
                if (order.status === 'NO_SHOW') departmentStats[dept].byShift[shiftName].noShow++;
            }
        });

        const shiftStats = byShift.map((s) => {
            const shift = shifts.find((sh) => sh.id === s.shiftId);
            return {
                shiftId: s.shiftId,
                shiftName: shift?.name,
                startTime: shift?.startTime,
                endTime: shift?.endTime,
                count: s._count.id,
            };
        });

        // Sort company and department stats by total orders
        const byCompany = Object.entries(companyStats)
            .map(([name, stats]) => ({ name, ...stats }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        const byDepartment = Object.entries(departmentStats)
            .map(([name, stats]) => ({
                name,
                total: stats.total,
                pickedUp: stats.pickedUp,
                pending: stats.pending,
                byShift: Object.entries(stats.byShift).map(([shiftName, shiftData]) => ({
                    shiftName,
                    ...shiftData
                }))
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        // Company-Shift recap for detailed view
        const companyShiftRecap = Object.entries(companyShiftStats)
            .map(([companyName, shifts]) => ({
                companyName,
                shifts: Object.entries(shifts).map(([shiftName, data]) => ({
                    shiftName,
                    ...data
                }))
            }))
            .sort((a, b) => {
                const aTotal = a.shifts.reduce((sum, s) => sum + s.total, 0);
                const bTotal = b.shifts.reduce((sum, s) => sum + s.total, 0);
                return bTotal - aTotal;
            });

        // Format no-show users from today and yesterday
        const todayNoShowUsers = todayNoShowOrders.map(order => ({
            userId: order.user.id,
            externalId: order.user.externalId,
            name: order.user.name,
            company: order.user.company,
            department: order.user.department,
            shiftName: order.shift.name,
            noShowCount: order.user.noShowCount,
            date: 'Hari Ini'
        }));

        const yesterdayNoShowUsers = yesterdayNoShowOrders.map(order => ({
            userId: order.user.id,
            externalId: order.user.externalId,
            name: order.user.name,
            company: order.user.company,
            department: order.user.department,
            shiftName: order.shift.name,
            noShowCount: order.user.noShowCount,
            date: 'Kemarin'
        }));

        // Combine and deduplicate by userId (show latest)
        const allNoShowUsers = [...todayNoShowUsers, ...yesterdayNoShowUsers];
        const uniqueNoShowUsers = Array.from(
            new Map(allNoShowUsers.map(user => [user.userId, user])).values()
        );

        // Calculate pickup rate
        const pickupRate = total > 0 ? Math.round((pickedUp / total) * 100) : 0;

        res.json({
            date: today.toISOString().split('T')[0],
            total,
            pickedUp,
            pending,
            cancelled,
            noShow,
            pickupRate,
            byShift: shiftStats,
            byCompany,
            byDepartment,
            companyShiftRecap,
            noShowUsers: {
                today: todayNoShowUsers,
                yesterday: yesterdayNoShowUsers,
                combined: uniqueNoShowUsers
            },
            holidays: todayHolidays.map((h) => ({
                id: h.id,
                name: h.name,
                shiftName: h.shift?.name || 'Semua Shift',
            })),
            blacklistedCount,
            usersAtRisk,
            blacklistStrikes,
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// Process no-shows manually (Admin only)
router.post('/process-no-shows', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { processNoShows, getNoShowStats } = await import('../services/noshow.service');

        const result = await processNoShows();
        const stats = await getNoShowStats();

        res.json({
            message: 'No-show processing completed',
            result,
            stats,
        });
    } catch (error) {
        console.error('Process no-shows error:', error);
        res.status(500).json({ error: 'Failed to process no-shows' });
    }
});

// Get no-show statistics (Admin only)
router.get('/no-show-stats', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { getNoShowStats } = await import('../services/noshow.service');
        const stats = await getNoShowStats();
        res.json(stats);
    } catch (error) {
        console.error('Get no-show stats error:', error);
        res.status(500).json({ error: 'Failed to get no-show statistics' });
    }
});

export default router;

