import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import {
    getSystemMetrics,
    listBackups,
    createBackup,
    restoreBackup,
    deleteBackup,
    cleanupOldBackups,
    getBackupSettings,
    updateBackupSettings,
    importBackupFile,
    BACKUP_DIR,
    RETENTION_DAYS
} from '../services/server.service';
import multer from 'multer';

// Multer config for backup upload
const upload = multer({ dest: 'uploads/temp/' });

const router = Router();

// ==================== PERFORMANCE ====================

// Get system performance metrics
router.get('/performance', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const metrics = await getSystemMetrics();
        res.json(metrics);
    } catch (error) {
        console.error('Get performance error:', error);
        res.status(500).json({ error: 'Gagal mengambil data performa' });
    }
});

// ==================== BACKUP ====================

// List all backups
router.get('/backup', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const backups = await listBackups();
        const settings = await getBackupSettings();
        res.json({
            backups,
            settings,
            backupDir: BACKUP_DIR,
            retentionDays: RETENTION_DAYS
        });
    } catch (error) {
        console.error('List backups error:', error);
        res.status(500).json({ error: 'Gagal mengambil daftar backup' });
    }
});

// Update backup settings
router.put('/backup/settings', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { autoBackupEnabled, autoBackupInterval } = req.body;
        const settings = await updateBackupSettings(autoBackupEnabled, autoBackupInterval);
        res.json(settings);
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Gagal memperbarui pengaturan backup' });
    }
});

// Upload backup file
router.post('/restore/upload', authMiddleware, adminMiddleware, upload.single('backup'), async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File backup tidak ditemukan' });
        }

        const userId = req.user!.id;
        const backup = await importBackupFile(
            userId,
            req.file.path,
            req.file.originalname,
            req.file.size
        );

        res.json({
            message: 'Backup berhasil diunggah',
            backup
        });
    } catch (error: any) {
        console.error('Upload backup error:', error);
        res.status(500).json({ error: error.message || 'Gagal mengunggah backup' });
    }
});

// Create new backup
router.post('/backup', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { notes } = req.body;
        const userId = req.user!.id;

        const backup = await createBackup(userId, notes);

        res.status(201).json({
            message: 'Backup berhasil dibuat',
            backup
        });
    } catch (error: any) {
        console.error('Create backup error:', error);
        res.status(500).json({ error: error.message || 'Gagal membuat backup' });
    }
});

// Download backup file
router.get('/backup/:id/download', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const backup = await prisma.backup.findUnique({
            where: { id: req.params.id }
        });

        if (!backup) {
            return res.status(404).json({ error: 'Backup tidak ditemukan' });
        }

        const filepath = path.join(BACKUP_DIR, backup.filename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'File backup tidak ditemukan' });
        }

        res.setHeader('Content-Type', 'application/sql');
        res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);

        const fileStream = fs.createReadStream(filepath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Download backup error:', error);
        res.status(500).json({ error: 'Gagal mengunduh backup' });
    }
});

// Delete backup
router.delete('/backup/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { adminPassword } = req.body;
        const userId = req.user!.id;

        // Verify admin password
        const admin = await prisma.user.findUnique({ where: { id: userId } });
        if (!admin) {
            return res.status(401).json({ error: 'User tidak ditemukan' });
        }

        const isPasswordValid = await bcrypt.compare(adminPassword, admin.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Password admin salah' });
        }

        await deleteBackup(req.params.id, userId);

        res.json({ message: 'Backup berhasil dihapus' });
    } catch (error: any) {
        console.error('Delete backup error:', error);
        res.status(500).json({ error: error.message || 'Gagal menghapus backup' });
    }
});

// Restore from backup (requires password + confirmation text)
router.post('/restore/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { adminPassword, confirmationText } = req.body;
        const userId = req.user!.id;
        const backupId = req.params.id;

        // Validate confirmation text
        if (confirmationText !== 'RESTORE DATABASE') {
            return res.status(400).json({
                error: 'Konfirmasi tidak valid. Ketik "RESTORE DATABASE" untuk melanjutkan.'
            });
        }

        // Verify admin password
        const admin = await prisma.user.findUnique({ where: { id: userId } });
        if (!admin) {
            return res.status(401).json({ error: 'User tidak ditemukan' });
        }

        const isPasswordValid = await bcrypt.compare(adminPassword, admin.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Password admin salah' });
        }

        // Get backup info for response
        const backup = await prisma.backup.findUnique({ where: { id: backupId } });
        if (!backup) {
            return res.status(404).json({ error: 'Backup tidak ditemukan' });
        }

        const result = await restoreBackup(backupId, userId);

        res.json(result);
    } catch (error: any) {
        console.error('Restore backup error:', error);
        res.status(500).json({ error: error.message || 'Gagal restore database' });
    }
});

// Manual cleanup of old backups
router.post('/backup/cleanup', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const deletedCount = await cleanupOldBackups();

        res.json({
            message: `${deletedCount} backup lama berhasil dihapus`,
            deletedCount,
            retentionDays: RETENTION_DAYS
        });
    } catch (error) {
        console.error('Cleanup backups error:', error);
        res.status(500).json({ error: 'Gagal membersihkan backup lama' });
    }
});

// ==================== UPTIME HISTORY ====================

import {
    getUptimeHistory,
    calculateDailyStats,
    getUptimeSummary,
    getDowntimePeriods
} from '../services/uptime.service';

// Get uptime event history
router.get('/uptime/history', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate dan endDate wajib diisi' });
        }

        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);

        const events = await getUptimeHistory(start, end);
        res.json({ events });
    } catch (error) {
        console.error('Get uptime history error:', error);
        res.status(500).json({ error: 'Gagal mengambil riwayat uptime' });
    }
});

// Get daily uptime statistics
router.get('/uptime/daily-stats', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate dan endDate wajib diisi' });
        }

        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);

        const dailyStats = await calculateDailyStats(start, end);
        res.json({ dailyStats });
    } catch (error) {
        console.error('Get daily stats error:', error);
        res.status(500).json({ error: 'Gagal mengambil statistik harian' });
    }
});

// Get uptime summary
router.get('/uptime/summary', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate dan endDate wajib diisi' });
        }

        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);

        const summary = await getUptimeSummary(start, end);
        const downtimePeriods = await getDowntimePeriods(start, end);

        res.json({ summary, downtimePeriods });
    } catch (error) {
        console.error('Get uptime summary error:', error);
        res.status(500).json({ error: 'Gagal mengambil ringkasan uptime' });
    }
});

// Export uptime history to XLSX
import ExcelJS from 'exceljs';
import { getNow } from '../services/time.service';

router.get('/uptime/export', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate dan endDate wajib diisi' });
        }

        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);

        const dailyStats = await calculateDailyStats(start, end);
        const summary = await getUptimeSummary(start, end);
        const downtimePeriods = await getDowntimePeriods(start, end);
        const events = await getUptimeHistory(start, end);

        // Create workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Catering Management System';
        workbook.created = getNow();

        // Helper to format duration
        const formatDuration = (ms: number): string => {
            if (ms <= 0) return '0s';
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            if (days > 0) return `${days}h ${hours % 24}j ${minutes % 60}m`;
            if (hours > 0) return `${hours}j ${minutes % 60}m`;
            if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
            return `${seconds}s`;
        };

        // Sheet 1: Summary
        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.columns = [
            { header: 'Metric', key: 'metric', width: 25 },
            { header: 'Value', key: 'value', width: 30 }
        ];
        summarySheet.addRows([
            { metric: 'Periode', value: `${startDate} s/d ${endDate}` },
            { metric: 'Total Hari', value: summary.daysInRange },
            { metric: 'Total Uptime', value: formatDuration(summary.totalUptimeMs) },
            { metric: 'Total Downtime', value: formatDuration(summary.totalDowntimeMs) },
            { metric: 'Uptime Percentage', value: `${summary.uptimePercent.toFixed(2)}%` },
            { metric: 'Total Restart', value: summary.totalRestarts }
        ]);
        summarySheet.getRow(1).font = { bold: true };

        // Sheet 2: Daily Stats
        const dailySheet = workbook.addWorksheet('Daily Stats');
        dailySheet.columns = [
            { header: 'Tanggal', key: 'date', width: 15 },
            { header: 'Hari', key: 'dayName', width: 12 },
            { header: 'Uptime', key: 'uptime', width: 15 },
            { header: 'Downtime', key: 'downtime', width: 15 },
            { header: 'Restart', key: 'restarts', width: 10 },
            { header: 'Uptime %', key: 'uptimePercent', width: 12 }
        ];
        dailyStats.forEach(stat => {
            dailySheet.addRow({
                date: stat.date,
                dayName: stat.dayName,
                uptime: formatDuration(stat.uptimeMs),
                downtime: formatDuration(stat.downtimeMs),
                restarts: stat.restarts,
                uptimePercent: `${stat.uptimePercent.toFixed(2)}%`
            });
        });
        dailySheet.getRow(1).font = { bold: true };

        // Sheet 3: Downtime Periods
        if (downtimePeriods.length > 0) {
            const downtimeSheet = workbook.addWorksheet('Downtime Periods');
            downtimeSheet.columns = [
                { header: 'Mulai', key: 'startTime', width: 25 },
                { header: 'Selesai', key: 'endTime', width: 25 },
                { header: 'Durasi', key: 'duration', width: 15 }
            ];
            downtimePeriods.forEach(period => {
                downtimeSheet.addRow({
                    startTime: new Date(period.startTime).toLocaleString('id-ID'),
                    endTime: period.endTime ? new Date(period.endTime).toLocaleString('id-ID') : 'Masih Down',
                    duration: formatDuration(period.durationMs)
                });
            });
            downtimeSheet.getRow(1).font = { bold: true };
        }

        // Sheet 4: Raw Events
        const eventsSheet = workbook.addWorksheet('Events');
        eventsSheet.columns = [
            { header: 'Timestamp', key: 'timestamp', width: 25 },
            { header: 'Event Type', key: 'eventType', width: 15 },
            { header: 'Process ID', key: 'processId', width: 15 },
            { header: 'Hostname', key: 'hostname', width: 20 },
            { header: 'Notes', key: 'notes', width: 30 }
        ];
        events.forEach((event: { timestamp: Date; eventType: string; processId: string | null; hostname: string | null; notes: string | null }) => {
            eventsSheet.addRow({
                timestamp: new Date(event.timestamp).toLocaleString('id-ID'),
                eventType: event.eventType,
                processId: event.processId || '-',
                hostname: event.hostname || '-',
                notes: event.notes || '-'
            });
        });
        eventsSheet.getRow(1).font = { bold: true };

        // Send response
        const filename = `Uptime_History_${startDate}_${endDate}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await workbook.xlsx.write(res);
    } catch (error) {
        console.error('Export uptime error:', error);
        res.status(500).json({ error: 'Gagal export data uptime' });
    }
});

export default router;

