import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { authMiddleware, AuthRequest, adminMiddleware } from '../middleware/auth.middleware';
import { getNow, getToday, getTomorrow } from '../services/time.service';
import { sendComplaintNotification } from '../services/email.service';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

const router = Router();
const prisma = new PrismaClient();

// Get all messages with filters (Admin only)
router.get('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { type, shiftId, startDate, endDate, userId, page = '1', limit = '50' } = req.query;

        const where: any = {};

        if (type) where.type = type;
        if (shiftId) where.shiftId = shiftId;
        if (userId) where.userId = userId;

        if (startDate || endDate) {
            where.orderDate = {};
            if (startDate) where.orderDate.gte = new Date(startDate as string);
            if (endDate) {
                const end = new Date(endDate as string);
                end.setHours(23, 59, 59, 999);
                where.orderDate.lte = end;
            }
        }

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const [messages, total] = await Promise.all([
            prisma.message.findMany({
                where,
                include: {
                    user: { select: { id: true, name: true, externalId: true, company: true, department: true } },
                    shift: { select: { id: true, name: true, startTime: true, endTime: true } },
                    order: { select: { id: true, status: true, orderDate: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit as string),
            }),
            prisma.message.count({ where }),
        ]);

        res.json({
            messages,
            pagination: {
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                total,
                totalPages: Math.ceil(total / parseInt(limit as string)),
            },
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Gagal mengambil data pesan' });
    }
});

// Create a new complaint message (User)
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { orderId, shiftId, content, orderDate } = req.body;
        const userId = req.user?.id;

        if (!userId || !shiftId || !content || !orderDate) {
            return res.status(400).json({ error: 'Data tidak lengkap. Shift, konten pesan, dan tanggal order wajib diisi.' });
        }

        // Validate shift exists
        const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
        if (!shift) {
            return res.status(404).json({ error: 'Shift tidak ditemukan' });
        }

        // If orderId is provided, validate it
        if (orderId) {
            const order = await prisma.order.findUnique({ where: { id: orderId } });
            if (!order) {
                return res.status(404).json({ error: 'Order tidak ditemukan' });
            }
            // Check if user owns this order
            if (order.userId !== userId) {
                return res.status(403).json({ error: 'Anda tidak memiliki akses ke order ini' });
            }
        }

        const message = await prisma.message.create({
            data: {
                orderId: orderId || null,
                shiftId,
                userId,
                type: 'COMPLAINT',
                content,
                orderDate: new Date(orderDate),
            },
            include: {
                user: { select: { id: true, name: true, externalId: true } },
                shift: { select: { id: true, name: true } },
            },
        });

        // Send email notification to admin (async, don't wait)
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, externalId: true, email: true }
        });

        if (user) {
            sendComplaintNotification({
                userName: user.name,
                userExternalId: user.externalId,
                userEmail: user.email,
                shiftName: shift.name,
                orderDate: format(new Date(orderDate), 'dd MMMM yyyy', { locale: idLocale }),
                content,
                createdAt: format(getNow(), 'dd MMMM yyyy HH:mm', { locale: idLocale }),
            }).catch(err => console.error('[Email] Failed to send complaint notification:', err));
        }

        res.status(201).json({
            message: 'Keluhan berhasil dikirim',
            data: message,
        });
    } catch (error) {
        console.error('Create message error:', error);
        res.status(500).json({ error: 'Gagal mengirim keluhan' });
    }
});

// Get messages for current user (for order history page)
router.get('/my-messages', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { page = '1', limit = '20' } = req.query;

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const [messages, total] = await Promise.all([
            prisma.message.findMany({
                where: { userId },
                include: {
                    shift: { select: { name: true } },
                    order: { select: { id: true, status: true, orderDate: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit as string),
            }),
            prisma.message.count({ where: { userId } }),
        ]);

        res.json({
            messages,
            pagination: {
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                total,
                totalPages: Math.ceil(total / parseInt(limit as string)),
            },
        });
    } catch (error) {
        console.error('Get my messages error:', error);
        res.status(500).json({ error: 'Gagal mengambil data pesan' });
    }
});

// Export messages to XLSX (Admin only)
router.get('/export', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { type, shiftId, startDate, endDate } = req.query;

        const where: any = {};

        if (type) where.type = type;
        if (shiftId) where.shiftId = shiftId;

        if (startDate || endDate) {
            where.orderDate = {};
            if (startDate) where.orderDate.gte = new Date(startDate as string);
            if (endDate) {
                const end = new Date(endDate as string);
                end.setHours(23, 59, 59, 999);
                where.orderDate.lte = end;
            }
        }

        const messages = await prisma.message.findMany({
            where,
            include: {
                user: { select: { name: true, externalId: true, company: true, department: true } },
                shift: { select: { name: true, startTime: true, endTime: true } },
                order: { select: { status: true } },
            },
            orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
        });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Catering Management System';
        workbook.created = getNow();

        const worksheet = workbook.addWorksheet('Pesan', {
            properties: { tabColor: { argb: '667eea' } },
            views: [{ state: 'frozen', xSplit: 0, ySplit: 3 }]
        });

        // Title Row
        worksheet.mergeCells('A1:I1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'LAPORAN PESAN & KELUHAN CATERING';
        titleCell.font = { bold: true, size: 16, color: { argb: 'FF333333' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(1).height = 30;

        // Info Row
        worksheet.mergeCells('A2:I2');
        const infoCell = worksheet.getCell('A2');
        const dateRange = startDate && endDate
            ? `Periode: ${new Date(startDate as string).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} - ${new Date(endDate as string).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
            : `Diekspor: ${getNow().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
        infoCell.value = `${dateRange} | Total: ${messages.length} pesan`;
        infoCell.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
        infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(2).height = 20;

        // Header Row
        const headers = [
            { header: 'No', key: 'no', width: 6 },
            { header: 'ID Karyawan', key: 'externalId', width: 14 },
            { header: 'Nama Karyawan', key: 'name', width: 25 },
            { header: 'Perusahaan', key: 'company', width: 18 },
            { header: 'Departemen', key: 'department', width: 18 },
            { header: 'Tanggal Order', key: 'orderDate', width: 18 },
            { header: 'Shift', key: 'shift', width: 14 },
            { header: 'Tipe', key: 'type', width: 14 },
            { header: 'Pesan', key: 'content', width: 50 },
            { header: 'Waktu Kirim', key: 'createdAt', width: 18 },
        ];

        worksheet.columns = headers;

        // Style header row (row 3)
        const headerRow = worksheet.getRow(3);
        headerRow.values = headers.map(h => h.header);
        headerRow.height = 25;
        headerRow.eachCell((cell) => {
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

        // Type labels
        const typeLabels: Record<string, string> = {
            'COMPLAINT': 'Keluhan',
            'CANCELLATION': 'Pembatalan'
        };

        // Type colors
        const typeColors: Record<string, string> = {
            'COMPLAINT': 'FFEF4444',     // Red
            'CANCELLATION': 'FFF59E0B'   // Yellow
        };

        // Add data rows
        messages.forEach((msg, index) => {
            const row = worksheet.addRow({
                no: index + 1,
                externalId: msg.user.externalId,
                name: msg.user.name,
                company: msg.user.company || '-',
                department: msg.user.department || '-',
                orderDate: msg.orderDate.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
                shift: msg.shift.name,
                type: typeLabels[msg.type] || msg.type,
                content: msg.content,
                createdAt: msg.createdAt.toLocaleString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
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
                cell.alignment = { vertical: 'middle', wrapText: colNumber === 9 };

                // Center alignment for specific columns
                if ([1, 2, 7, 8, 10].includes(colNumber)) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                }
            });

            // Color type cell
            const typeCell = row.getCell(8);
            typeCell.font = { bold: true, color: { argb: typeColors[msg.type] || 'FF333333' } };
        });

        // Summary section
        const summaryStartRow = worksheet.rowCount + 2;

        worksheet.mergeCells(`A${summaryStartRow}:D${summaryStartRow}`);
        const summaryTitle = worksheet.getCell(`A${summaryStartRow}`);
        summaryTitle.value = 'RINGKASAN PESAN';
        summaryTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667eea' } };
        summaryTitle.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };

        const stats = {
            total: messages.length,
            complaints: messages.filter(m => m.type === 'COMPLAINT').length,
            cancellations: messages.filter(m => m.type === 'CANCELLATION').length,
        };

        const summaryData = [
            ['Total Pesan', stats.total, '', ''],
            ['Keluhan Makanan', stats.complaints, stats.total > 0 ? `${Math.round((stats.complaints / stats.total) * 100)}%` : '0%', ''],
            ['Pembatalan Order', stats.cancellations, stats.total > 0 ? `${Math.round((stats.cancellations / stats.total) * 100)}%` : '0%', ''],
        ];

        summaryData.forEach((item, idx) => {
            const row = worksheet.getRow(summaryStartRow + 1 + idx);
            row.getCell(1).value = item[0];
            row.getCell(2).value = item[1];
            row.getCell(3).value = item[2];
            row.getCell(1).font = { color: { argb: 'FF333333' } };
            row.getCell(2).font = { bold: true, color: { argb: 'FF333333' } };
            row.getCell(3).font = { italic: true, color: { argb: 'FF666666' } };
        });

        const filename = `Pesan_Catering_${getNow().toISOString().split('T')[0]}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Export messages error:', error);
        res.status(500).json({ error: 'Gagal mengekspor data pesan' });
    }
});

export default router;
