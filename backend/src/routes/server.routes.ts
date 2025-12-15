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
    BACKUP_DIR,
    RETENTION_DAYS
} from '../services/server.service';

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
        res.json({
            backups,
            backupDir: BACKUP_DIR,
            retentionDays: RETENTION_DAYS
        });
    } catch (error) {
        console.error('List backups error:', error);
        res.status(500).json({ error: 'Gagal mengambil daftar backup' });
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

export default router;
