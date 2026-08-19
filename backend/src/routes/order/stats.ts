/**
 * Order Statistics & Export Routes
 * - GET /export - Export transactions to Excel (Admin only)
 * - GET /stats/range - Order statistics for a date range (Admin only)
 * - GET /stats/today - Today's order statistics (Admin only)
 *
 * Moved verbatim from the legacy order.routes.ts during the modular
 * consolidation. Business logic, date handling (Fake-UTC/Shifted-UTC) and
 * response shapes are unchanged.
 */

import {
    Router,
    Response,
    prisma,
    ExcelJS,
    AuthRequest,
    authMiddleware,
    adminMiddleware,
    getNow,
    getToday,
    getTomorrow,
    getCachedSettings,
} from './shared';
import { cacheService, CACHE_KEYS, CACHE_TTL } from '../../services/cache.service';

const router = Router();

// Export transactions to Excel (Admin only)
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

        // FIX-H4: Collect checkedInByIds in batches first (lightweight query)
        const checkedInByIds = new Set<string>();
        let cidCursor: string | undefined;
        const CID_BATCH = 1000;
        do {
            const cidBatch = await prisma.order.findMany({
                where: { ...where, checkedInById: { not: null } },
                select: { id: true, checkedInById: true },
                orderBy: { id: 'asc' },
                take: CID_BATCH,
                ...(cidCursor ? { skip: 1, cursor: { id: cidCursor } } : {}),
            });
            for (const o of cidBatch) {
                if (o.checkedInById) checkedInByIds.add(o.checkedInById);
            }
            cidCursor = cidBatch.length === CID_BATCH ? cidBatch[cidBatch.length - 1].id : undefined;
        } while (cidCursor);

        const canteenUsersMap = new Map<string, { name: string; externalId: string }>();
        if (checkedInByIds.size > 0) {
            const canteenUsers = await prisma.user.findMany({
                where: { id: { in: [...checkedInByIds] } },
                select: { id: true, name: true, externalId: true }
            });
            canteenUsers.forEach(u => canteenUsersMap.set(u.id, { name: u.name, externalId: u.externalId }));
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Catering Management System';
        workbook.created = getNow();
        workbook.properties.date1904 = false;

        // ========== SHEET 1: DETAIL TRANSAKSI ==========
        const worksheet = workbook.addWorksheet('Detail Transaksi', {
            properties: { tabColor: { argb: '667eea' } },
            views: [{ state: 'frozen', xSplit: 0, ySplit: 3 }]
        });

        // Title Row
        worksheet.mergeCells('A1:S1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'LAPORAN DETAIL TRANSAKSI & BIAYA CATERING';
        titleCell.font = { bold: true, size: 16, color: { argb: 'FF333333' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(1).height = 30;

        // FIX-H4: Count total orders for info row (lightweight query)
        const totalOrdersCount = await prisma.order.count({ where });

        // Info Row
        worksheet.mergeCells('A2:S2');
        const infoCell = worksheet.getCell('A2');
        const dateRange = startDate && endDate
            ? `Periode: ${new Date(startDate as string).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} - ${new Date(endDate as string).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
            : `Diekspor: ${getNow().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
        infoCell.value = `${dateRange} | Total: ${totalOrdersCount} transaksi`;
        infoCell.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
        infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(2).height = 20;

        // Header Row - Enhanced with cost columns
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
            { header: 'Lokasi / Kantin', key: 'canteen', width: 20 },
            { header: 'Status', key: 'status', width: 16 },
            { header: 'Harga Makanan', key: 'mealPrice', width: 16 },
            { header: 'Biaya Aktual', key: 'actualCost', width: 16 },
            { header: 'Kerugian', key: 'wasteCost', width: 16 },
            { header: 'Tanggal Ambil', key: 'checkInDate', width: 18 },
            { header: 'Jam Ambil', key: 'checkInTime', width: 12 },
            { header: 'Diproses Oleh', key: 'processedBy', width: 22 },
            { header: 'Alasan Batal', key: 'cancelReason', width: 25 },
            { header: 'Keterangan', key: 'notes', width: 20 },
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

        // Cost tracking variables
        let totalMealCost = 0;
        let totalActualCost = 0;
        let totalWasteCost = 0;
        let totalPendingCost = 0; // Biaya order dengan status ORDERED (menunggu)
        let rowIndex = 0; // FIX-H4: total row counter for cursor-based pagination

        // FIX-H4: Stats counters (replace orders.filter() calls)
        let statsTotal = 0;
        let statsPickedUp = 0;
        let statsPending = 0;
        let statsNoShow = 0;
        let statsCancelled = 0;

        // Company cost breakdown
        const companyCosts: Record<string, { orders: number; pickedUp: number; noShow: number; cancelled: number; totalCost: number; wasteCost: number }> = {};

        // Shift cost breakdown
        const shiftCosts: Record<string, { name: string; orders: number; pickedUp: number; noShow: number; price: number; totalCost: number; wasteCost: number }> = {};

        // FIX-H4: Process orders in cursor-based batches of 1000
        const BATCH_SIZE = 1000;
        let cursor: string | undefined;
        let hasMore = true;

        while (hasMore) {
            const batch = await prisma.order.findMany({
                where,
                include: {
                    user: true,
                    shift: true,
                    canteen: true,
                },
                orderBy: [{ orderDate: 'desc' }, { orderTime: 'desc' }],
                take: BATCH_SIZE,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            });

            if (batch.length < BATCH_SIZE) {
                hasMore = false;
            }
            if (batch.length > 0) {
                cursor = batch[batch.length - 1].id;
            }

            // Process this batch
            for (const order of batch) {
                // Use order's historical mealPrice if available, otherwise use shift's current price
                const mealPrice = Number((order as any).mealPrice) || Number(order.shift.mealPrice) || 25000;
                let actualCost = 0;
                let wasteCost = 0;

                if (order.status === 'PICKED_UP') {
                    actualCost = mealPrice;
                    statsPickedUp++;
                    statsTotal++;
                } else if (order.status === 'NO_SHOW') {
                    wasteCost = mealPrice;
                    statsNoShow++;
                    statsTotal++;
                } else if (order.status === 'ORDERED') {
                    totalPendingCost += mealPrice;
                    statsPending++;
                    statsTotal++;
                } else if (order.status === 'CANCELLED') {
                    statsCancelled++;
                }

                totalMealCost += (order.status !== 'CANCELLED' ? mealPrice : 0);
                totalActualCost += actualCost;
                totalWasteCost += wasteCost;

                // Update company breakdown
                const companyName = order.user.company || 'Tidak Ada';
                if (!companyCosts[companyName]) {
                    companyCosts[companyName] = { orders: 0, pickedUp: 0, noShow: 0, cancelled: 0, totalCost: 0, wasteCost: 0 };
                }
                companyCosts[companyName].orders++;
                if (order.status === 'PICKED_UP') companyCosts[companyName].pickedUp++;
                if (order.status === 'NO_SHOW') companyCosts[companyName].noShow++;
                if (order.status === 'CANCELLED') companyCosts[companyName].cancelled++;
                companyCosts[companyName].totalCost += (order.status !== 'CANCELLED' ? mealPrice : 0);
                companyCosts[companyName].wasteCost += wasteCost;

                // Update shift breakdown
                const shiftId = order.shiftId;
                if (!shiftCosts[shiftId]) {
                    shiftCosts[shiftId] = { name: order.shift.name, orders: 0, pickedUp: 0, noShow: 0, price: mealPrice, totalCost: 0, wasteCost: 0 };
                }
                shiftCosts[shiftId].orders++;
                if (order.status === 'PICKED_UP') shiftCosts[shiftId].pickedUp++;
                if (order.status === 'NO_SHOW') shiftCosts[shiftId].noShow++;
                shiftCosts[shiftId].totalCost += (order.status !== 'CANCELLED' ? mealPrice : 0);
                shiftCosts[shiftId].wasteCost += wasteCost;

                // Determine who processed this order
                let processedBy = '-';
                if (order.status === 'PICKED_UP' && order.checkedInById) {
                    const canteenUser = canteenUsersMap.get(order.checkedInById);
                    processedBy = canteenUser ? canteenUser.name : (order.checkedInBy || '-');
                } else if (order.status === 'CANCELLED' && order.cancelledBy) {
                    processedBy = order.cancelledBy;
                } else if (order.status === 'NO_SHOW') {
                    processedBy = 'Sistem (Auto)';
                }

                // Generate notes based on status
                let notes = '';
                if (order.status === 'NO_SHOW') notes = 'Kerugian makanan';
                else if (order.status === 'CANCELLED') notes = 'Tidak dikenakan biaya';
                else if (order.status === 'PICKED_UP') notes = 'Diambil';
                else if (order.status === 'ORDERED') notes = 'Menunggu';

                const row = worksheet.addRow({
                    no: rowIndex + 1,
                    externalId: order.user.externalId,
                    name: order.user.name,
                    company: order.user.company || '-',
                    division: order.user.division || '-',
                    department: order.user.department || '-',
                    shift: order.shift.name,
                    shiftTime: `${order.shift.startTime} - ${order.shift.endTime}`,
                    orderDate: order.orderDate.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
                    orderTime: order.orderTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    canteen: order.canteen?.name || '-',
                    status: statusLabels[order.status] || order.status,
                    mealPrice: mealPrice,
                    actualCost: actualCost,
                    wasteCost: wasteCost,
                    checkInDate: order.checkInTime ? order.checkInTime.toLocaleDateString('id-ID', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '-',
                    checkInTime: order.checkInTime ? order.checkInTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-',
                    processedBy: processedBy,
                    cancelReason: order.cancelReason || '-',
                    notes: notes
                });

                // Format currency columns
                [12, 13, 14].forEach(colNum => {
                    const cell = row.getCell(colNum);
                    cell.numFmt = '"Rp "#,##0';
                });

                // Alternate row colors
                const bgColor = rowIndex % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF';
                row.eachCell((cell, colNumber) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                    };
                    cell.alignment = { vertical: 'middle' };
                    if ([1, 7, 8, 10, 11, 12, 13, 14, 15, 16].includes(colNumber)) {
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    }
                });

                // Color status cell
                const statusCell = row.getCell(11);
                statusCell.font = { bold: true, color: { argb: statusColors[order.status] || 'FF333333' } };

                // Highlight waste cost in red
                if (wasteCost > 0) {
                    row.getCell(14).font = { bold: true, color: { argb: 'FFEF4444' } };
                }

                rowIndex++;
            }
        }

        // ========== SHEET 2: RINGKASAN BIAYA ==========
        const summarySheet = workbook.addWorksheet('Ringkasan Biaya', {
            properties: { tabColor: { argb: '10B981' } }
        });

        // Title
        summarySheet.mergeCells('A1:F1');
        summarySheet.getCell('A1').value = 'RINGKASAN BIAYA CATERING';
        summarySheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF333333' } };
        summarySheet.getCell('A1').alignment = { horizontal: 'center' };
        summarySheet.getRow(1).height = 30;

        // Date range info
        summarySheet.mergeCells('A2:F2');
        summarySheet.getCell('A2').value = dateRange;
        summarySheet.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF666666' } };
        summarySheet.getCell('A2').alignment = { horizontal: 'center' };

        // Cost Summary Cards — FIX-H4: use counters from batch loop
        const stats = {
            total: statsTotal,
            pickedUp: statsPickedUp,
            pending: statsPending,
            noShow: statsNoShow,
            cancelled: statsCancelled
        };

        const wasteRate = stats.total > 0 ? Math.round((stats.noShow / stats.total) * 100) : 0;

        // Summary table
        summarySheet.getCell('A4').value = 'Metrik';
        summarySheet.getCell('B4').value = 'Jumlah';
        summarySheet.getCell('C4').value = 'Persentase';
        summarySheet.getCell('D4').value = 'Biaya (Rp)';
        ['A4', 'B4', 'C4', 'D4'].forEach(cell => {
            summarySheet.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
            summarySheet.getCell(cell).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            summarySheet.getCell(cell).alignment = { horizontal: 'center' };
        });

        const summaryData = [
            ['Total Pesanan', stats.total, '100%', totalMealCost],
            ['Diambil (PICKED_UP)', stats.pickedUp, `${stats.total > 0 ? Math.round((stats.pickedUp / stats.total) * 100) : 0}%`, totalActualCost],
            ['Menunggu (ORDERED)', stats.pending, `${stats.total > 0 ? Math.round((stats.pending / stats.total) * 100) : 0}%`, totalPendingCost],
            ['Tidak Diambil (NO_SHOW)', stats.noShow, `${wasteRate}%`, totalWasteCost],
            ['Dibatalkan', stats.cancelled, '-', 0],
        ];

        summaryData.forEach((data, idx) => {
            const rowNum = 5 + idx;
            summarySheet.getCell(`A${rowNum}`).value = data[0];
            summarySheet.getCell(`B${rowNum}`).value = data[1];
            summarySheet.getCell(`C${rowNum}`).value = data[2];
            summarySheet.getCell(`D${rowNum}`).value = data[3];
            summarySheet.getCell(`D${rowNum}`).numFmt = '"Rp "#,##0';

            if (data[0] === 'Tidak Diambil (NO_SHOW)') {
                summarySheet.getCell(`A${rowNum}`).font = { color: { argb: 'FFEF4444' } };
                summarySheet.getCell(`D${rowNum}`).font = { bold: true, color: { argb: 'FFEF4444' } };
            }
        });

        // KEY METRICS
        summarySheet.getCell('A12').value = 'INDIKATOR KUNCI';
        summarySheet.getCell('A12').font = { bold: true, size: 12 };

        summarySheet.getCell('A13').value = 'Tingkat Keberhasilan Pengambilan';
        summarySheet.getCell('B13').value = `${stats.total > 0 ? Math.round((stats.pickedUp / stats.total) * 100) : 0}%`;
        summarySheet.getCell('B13').font = { bold: true, color: { argb: 'FF10B981' } };

        summarySheet.getCell('A14').value = 'Tingkat Kerugian (Waste Rate)';
        summarySheet.getCell('B14').value = `${wasteRate}%`;
        summarySheet.getCell('B14').font = { bold: true, color: { argb: 'FFEF4444' } };

        summarySheet.getCell('A15').value = 'Total Kerugian dari No-Show';
        summarySheet.getCell('B15').value = totalWasteCost;
        summarySheet.getCell('B15').numFmt = '"Rp "#,##0';
        summarySheet.getCell('B15').font = { bold: true, color: { argb: 'FFEF4444' } };

        // Set column widths
        summarySheet.getColumn('A').width = 35;
        summarySheet.getColumn('B').width = 20;
        summarySheet.getColumn('C').width = 15;
        summarySheet.getColumn('D').width = 20;

        // ========== SHEET 3: BREAKDOWN PER PERUSAHAAN ==========
        const companySheet = workbook.addWorksheet('Per Perusahaan', {
            properties: { tabColor: { argb: 'F59E0B' } }
        });

        companySheet.mergeCells('A1:G1');
        companySheet.getCell('A1').value = 'BREAKDOWN BIAYA PER PERUSAHAAN';
        companySheet.getCell('A1').font = { bold: true, size: 14 };
        companySheet.getCell('A1').alignment = { horizontal: 'center' };

        const companyHeaders = ['Perusahaan', 'Total Order', 'Diambil', 'No-Show', 'Dibatalkan', 'Biaya (Rp)', 'Kerugian (Rp)'];
        companyHeaders.forEach((h, i) => {
            const cell = companySheet.getCell(3, i + 1);
            cell.value = h;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { horizontal: 'center' };
        });

        Object.entries(companyCosts)
            .sort((a, b) => b[1].totalCost - a[1].totalCost)
            .forEach(([company, data], idx) => {
                const rowNum = 4 + idx;
                companySheet.getCell(`A${rowNum}`).value = company;
                companySheet.getCell(`B${rowNum}`).value = data.orders;
                companySheet.getCell(`C${rowNum}`).value = data.pickedUp;
                companySheet.getCell(`D${rowNum}`).value = data.noShow;
                companySheet.getCell(`E${rowNum}`).value = data.cancelled;
                companySheet.getCell(`F${rowNum}`).value = data.totalCost;
                companySheet.getCell(`F${rowNum}`).numFmt = '"Rp "#,##0';
                companySheet.getCell(`G${rowNum}`).value = data.wasteCost;
                companySheet.getCell(`G${rowNum}`).numFmt = '"Rp "#,##0';
                if (data.wasteCost > 0) {
                    companySheet.getCell(`G${rowNum}`).font = { color: { argb: 'FFEF4444' } };
                }
            });

        companySheet.columns = [
            { width: 25 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 18 }
        ];

        // ========== SHEET 4: BREAKDOWN PER SHIFT ==========
        const shiftSheet = workbook.addWorksheet('Per Shift', {
            properties: { tabColor: { argb: '8B5CF6' } }
        });

        shiftSheet.mergeCells('A1:G1');
        shiftSheet.getCell('A1').value = 'BREAKDOWN BIAYA PER SHIFT';
        shiftSheet.getCell('A1').font = { bold: true, size: 14 };
        shiftSheet.getCell('A1').alignment = { horizontal: 'center' };

        const shiftHeaders = ['Shift', 'Harga/Porsi', 'Total Order', 'Diambil', 'No-Show', 'Biaya (Rp)', 'Kerugian (Rp)'];
        shiftHeaders.forEach((h, i) => {
            const cell = shiftSheet.getCell(3, i + 1);
            cell.value = h;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { horizontal: 'center' };
        });

        Object.values(shiftCosts)
            .sort((a, b) => b.totalCost - a.totalCost)
            .forEach((data, idx) => {
                const rowNum = 4 + idx;
                shiftSheet.getCell(`A${rowNum}`).value = data.name;
                shiftSheet.getCell(`B${rowNum}`).value = data.price;
                shiftSheet.getCell(`B${rowNum}`).numFmt = '"Rp "#,##0';
                shiftSheet.getCell(`C${rowNum}`).value = data.orders;
                shiftSheet.getCell(`D${rowNum}`).value = data.pickedUp;
                shiftSheet.getCell(`E${rowNum}`).value = data.noShow;
                shiftSheet.getCell(`F${rowNum}`).value = data.totalCost;
                shiftSheet.getCell(`F${rowNum}`).numFmt = '"Rp "#,##0';
                shiftSheet.getCell(`G${rowNum}`).value = data.wasteCost;
                shiftSheet.getCell(`G${rowNum}`).numFmt = '"Rp "#,##0';
                if (data.wasteCost > 0) {
                    shiftSheet.getCell(`G${rowNum}`).font = { color: { argb: 'FFEF4444' } };
                }
            });

        shiftSheet.columns = [
            { width: 15 }, { width: 15 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 18 }
        ];

        const filename = `Laporan_Catering_${getNow().toISOString().split('T')[0]}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export transactions' });
    }
});

// Get order statistics for date range (Admin only)
router.get('/stats/range', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { startDate: startDateParam, endDate: endDateParam } = req.query;

        if (!startDateParam || !endDateParam) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const startDate = new Date(startDateParam as string);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(endDateParam as string);
        endDate.setHours(23, 59, 59, 999);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ error: 'Invalid date format' });
        }

        // Get settings for blacklist threshold
        const settings = await getCachedSettings();
        const blacklistStrikes = settings?.blacklistStrikes || 3;

        const [total, pickedUp, pending, cancelled, noShow, shiftGroup, shifts, holidays, canteenGroup, canteens, blacklistedCount, usersAtRisk, ordersWithDetails] = await Promise.all([
            // Total does NOT include cancelled orders - only actual orders
            prisma.order.count({
                where: { orderDate: { gte: startDate, lte: endDate }, status: { not: 'CANCELLED' } },
            }),
            prisma.order.count({
                where: { orderDate: { gte: startDate, lte: endDate }, status: 'PICKED_UP' },
            }),
            prisma.order.count({
                where: { orderDate: { gte: startDate, lte: endDate }, status: 'ORDERED' },
            }),
            prisma.order.count({
                where: { orderDate: { gte: startDate, lte: endDate }, status: 'CANCELLED' },
            }),
            prisma.order.count({
                where: { orderDate: { gte: startDate, lte: endDate }, status: 'NO_SHOW' },
            }),
            // byShift also excludes cancelled orders
            prisma.order.groupBy({
                by: ['shiftId'],
                where: { orderDate: { gte: startDate, lte: endDate }, status: { not: 'CANCELLED' } },
                _count: { id: true },
            }),
            prisma.shift.findMany({ where: { isActive: true }, include: { dayBreaks: true } }),
            prisma.holiday.findMany({
                where: {
                    date: { gte: startDate, lte: endDate },
                    isActive: true,
                },
                include: { shift: true },
            }),
            // byCanteen
            prisma.order.groupBy({
                by: ['canteenId'],
                where: { orderDate: { gte: startDate, lte: endDate }, status: { not: 'CANCELLED' } },
                _count: { id: true },
            }),
            prisma.canteen.findMany({ where: { isActive: true } }),
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
                where: { orderDate: { gte: startDate, lte: endDate }, status: { not: 'CANCELLED' } },
                include: {
                    user: { select: { company: true, department: true } },
                    shift: { select: { name: true, mealPrice: true } }
                },
            }),
        ]);

        // Calculate stats by department
        const departmentStats: Record<string, {
            total: number;
            pickedUp: number;
            pending: number;
            cost: number;
            byShift: Record<string, { total: number; pickedUp: number; noShow: number }>;
        }> = {};

        ordersWithDetails.forEach((order) => {
            const dept = order.user.department?.trim();
            const shiftName = order.shift?.name || 'Unknown';

            if (dept && dept.length > 0) {
                if (!departmentStats[dept]) {
                    departmentStats[dept] = { total: 0, pickedUp: 0, pending: 0, cost: 0, byShift: {} };
                }
                departmentStats[dept].total++;
                departmentStats[dept].cost += Number((order as any).mealPrice) || Number(order.shift?.mealPrice) || 25000;
                if (order.status === 'PICKED_UP') departmentStats[dept].pickedUp++;
                if (order.status === 'ORDERED') departmentStats[dept].pending++;

                if (!departmentStats[dept].byShift[shiftName]) {
                    departmentStats[dept].byShift[shiftName] = { total: 0, pickedUp: 0, noShow: 0 };
                }
                departmentStats[dept].byShift[shiftName].total++;
                if (order.status === 'PICKED_UP') departmentStats[dept].byShift[shiftName].pickedUp++;
                if (order.status === 'NO_SHOW') departmentStats[dept].byShift[shiftName].noShow++;
            }
        });

        const shiftStats = shiftGroup.map((s) => {
            const shift = shifts.find((sh) => sh.id === s.shiftId);
            return {
                shiftId: s.shiftId,
                shiftName: shift?.name,
                startTime: shift?.startTime,
                endTime: shift?.endTime,
                breakStartTime: shift?.breakStartTime,
                breakEndTime: shift?.breakEndTime,
                hasSpecialDayBreaks: shift?.hasSpecialDayBreaks,
                dayBreaks: shift?.dayBreaks || [],
                count: s._count.id,
            };
        });

        const byDepartment = Object.entries(departmentStats)
            .map(([name, stats]) => ({
                name,
                total: stats.total,
                pickedUp: stats.pickedUp,
                pending: stats.pending,
                cost: stats.cost,
                byShift: Object.entries(stats.byShift).map(([shiftName, shiftData]) => ({
                    shiftName,
                    ...shiftData
                }))
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        // Calculate pickup rate
        const pickupRate = total > 0 ? Math.round((pickedUp / total) * 100) : 0;

        const canteenStats = canteens.map(c => {
            const stat = canteenGroup.find(g => g.canteenId === c.id);
            return {
                canteenId: c.id,
                canteenName: c.name,
                count: stat?._count.id || 0
            };
        }).sort((a, b) => b.count - a.count);

        res.json({
            date: startDateParam,
            dateRange: { start: startDateParam, end: endDateParam },
            total,
            pickedUp,
            pending,
            cancelled,
            noShow,
            pickupRate,
            byShift: shiftStats,
            byCanteen: canteenStats,
            byDepartment,
            holidays: holidays.map((h) => ({
                id: h.id,
                name: h.name,
                shiftName: h.shift?.name || 'Semua Shift',
            })),
            blacklistedCount,
            usersAtRisk,
            blacklistStrikes,
        });
    } catch (error) {
        console.error('Get stats range error:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// Get order statistics (Admin only) - Enhanced with company, department, and risk users
router.get('/stats/today', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const today = getToday();
        const tomorrow = getTomorrow();
        const dateKey = today.toISOString().split('T')[0];

        // Check cache first for performance
        const cacheKey = CACHE_KEYS.DASHBOARD_STATS(dateKey);
        const cached = await cacheService.get<any>(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Get settings for blacklist threshold
        const settings = await getCachedSettings();
        const blacklistStrikes = settings?.blacklistStrikes || 3;

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const [total, pickedUp, pending, cancelled, noShow, byShift, shifts, todayHolidays, blacklistedCount, usersAtRisk, ordersWithDetails, todayNoShowOrders, yesterdayNoShowOrders] = await Promise.all([
            // Total does NOT include cancelled orders - only actual orders
            prisma.order.count({
                where: { orderDate: { gte: today, lt: tomorrow }, status: { not: 'CANCELLED' } },
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
            // byShift also excludes cancelled orders
            prisma.order.groupBy({
                by: ['shiftId'],
                where: { orderDate: { gte: today, lt: tomorrow }, status: { not: 'CANCELLED' } },
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

        // Build response object
        const statsResponse = {
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
        };

        // Cache the response for 60 seconds
        await cacheService.set(cacheKey, statsResponse, { ttl: CACHE_TTL.DASHBOARD_STATS });

        res.json(statsResponse);
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

export default router;
