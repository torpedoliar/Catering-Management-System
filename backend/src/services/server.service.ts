import os from 'os';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '../lib/prisma';
import { logSystem } from './audit.service';
import { AuditAction } from '@prisma/client';

const execAsync = promisify(exec);

// Backup directory
const BACKUP_DIR = process.env.BACKUP_DIR || '/app/backups';
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// ==================== SYSTEM METRICS ====================

export interface SystemMetrics {
    cpu: {
        usage: number;
        cores: number;
        model: string;
    };
    memory: {
        total: number;
        used: number;
        free: number;
        usagePercent: number;
    };
    disk: {
        total: number;
        used: number;
        free: number;
        usagePercent: number;
    };
    uptime: {
        system: number;
        process: number;
    };
    nodejs: {
        version: string;
        memoryUsage: NodeJS.MemoryUsage;
    };
    database: {
        connected: boolean;
        tableCount: number;
        totalRecords: number;
    };
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Calculate CPU usage
    let cpuUsage = 0;
    for (const cpu of cpus) {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle;
        cpuUsage += ((total - idle) / total) * 100;
    }
    cpuUsage = cpuUsage / cpus.length;

    // Get disk usage (platform-specific)
    let diskInfo = { total: 0, used: 0, free: 0, usagePercent: 0 };
    try {
        if (process.platform === 'win32') {
            const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
            const lines = stdout.trim().split('\n').slice(1);
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 3 && parts[0].includes('C:')) {
                    diskInfo.free = parseInt(parts[1]) || 0;
                    diskInfo.total = parseInt(parts[2]) || 0;
                    diskInfo.used = diskInfo.total - diskInfo.free;
                    diskInfo.usagePercent = diskInfo.total > 0 ? (diskInfo.used / diskInfo.total) * 100 : 0;
                }
            }
        } else {
            const { stdout } = await execAsync("df -B1 / | tail -1");
            const parts = stdout.trim().split(/\s+/);
            diskInfo.total = parseInt(parts[1]) || 0;
            diskInfo.used = parseInt(parts[2]) || 0;
            diskInfo.free = parseInt(parts[3]) || 0;
            diskInfo.usagePercent = diskInfo.total > 0 ? (diskInfo.used / diskInfo.total) * 100 : 0;
        }
    } catch (error) {
        console.error('Error getting disk info:', error);
    }

    // Get database stats
    let dbStats = { connected: false, tableCount: 0, totalRecords: 0 };
    try {
        const tables = await prisma.$queryRaw<{ count: number }[]>`
            SELECT count(*) as count FROM information_schema.tables 
            WHERE table_schema = 'public'
        `;

        const userCount = await prisma.user.count();
        const orderCount = await prisma.order.count();
        const auditCount = await prisma.auditLog.count();

        dbStats = {
            connected: true,
            tableCount: Number(tables[0]?.count) || 0,
            totalRecords: userCount + orderCount + auditCount
        };
    } catch (error) {
        console.error('Error getting DB stats:', error);
    }

    return {
        cpu: {
            usage: Math.round(cpuUsage * 100) / 100,
            cores: cpus.length,
            model: cpus[0]?.model || 'Unknown'
        },
        memory: {
            total: totalMem,
            used: usedMem,
            free: freeMem,
            usagePercent: Math.round((usedMem / totalMem) * 10000) / 100
        },
        disk: diskInfo,
        uptime: {
            system: os.uptime(),
            process: process.uptime()
        },
        nodejs: {
            version: process.version,
            memoryUsage: process.memoryUsage()
        },
        database: dbStats
    };
}

// ==================== BACKUP MANAGEMENT ====================

export interface BackupInfo {
    id: string;
    filename: string;
    filepath: string;
    size: number;
    createdAt: Date;
    createdById: string | null;
    createdByName: string | null;
    notes: string | null;
    status: string;
}

export async function listBackups(): Promise<BackupInfo[]> {
    try {
        const backups = await prisma.backup.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: {
                    select: { name: true }
                }
            }
        });

        return backups.map((b: any) => ({
            id: b.id,
            filename: b.filename,
            filepath: path.join(BACKUP_DIR, b.filename),
            size: b.size,
            createdAt: b.createdAt,
            createdById: b.createdById,
            createdByName: b.createdBy?.name || null,
            notes: b.notes,
            status: b.status
        }));
    } catch (error) {
        console.error('Error listing backups:', error);
        return [];
    }
}

export async function createBackup(userId: string | null, notes?: string): Promise<BackupInfo> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestamp}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);

    // Create backup record first
    const backup = await prisma.backup.create({
        data: {
            filename,
            size: 0,
            createdById: userId,
            notes: notes || null,
            status: 'IN_PROGRESS'
        },
        include: {
            createdBy: { select: { name: true } }
        }
    });

    try {
        // Get database connection details
        const dbUrl = process.env.DATABASE_URL;
        let user, password, host, port, database;

        if (dbUrl) {
            const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
            if (match) {
                [, user, password, host, port, database] = match;
                // Remove query parameters from database name if present
                if (database.includes('?')) {
                    database = database.split('?')[0];
                }
            }
        }

        // Fallback to individual env vars if URL parsing failed or URL not present
        if (!user) user = process.env.DB_USER || 'postgres';
        if (!password) password = process.env.DB_PASSWORD || 'postgres';
        if (!host) host = process.env.DB_HOST || 'db';
        if (!port) port = process.env.DB_PORT || '5432';
        if (!database) database = process.env.DB_NAME || 'catering_db';

        // Execute pg_dump
        const dumpCommand = `PGPASSWORD="${password}" pg_dump -h ${host} -p ${port} -U ${user} -d ${database} -F p -f "${filepath}"`;

        await execAsync(dumpCommand);

        // Get file size
        const stats = fs.statSync(filepath);

        // Update backup record
        const updatedBackup = await prisma.backup.update({
            where: { id: backup.id },
            data: {
                size: stats.size,
                status: 'COMPLETED'
            },
            include: {
                createdBy: { select: { name: true } }
            }
        });

        // Create audit log
        await logSystem(AuditAction.OTHER, `Backup created: ${filename}`, {
            entity: 'Backup',
            entityId: backup.id,
            metadata: {
                filename,
                size: stats.size,
                notes,
                createdBy: userId
            }
        });

        console.log(`✅ Backup created: ${filename} (${formatBytes(stats.size)})`);

        return {
            id: updatedBackup.id,
            filename: updatedBackup.filename,
            filepath,
            size: updatedBackup.size,
            createdAt: updatedBackup.createdAt,
            createdById: updatedBackup.createdById,
            createdByName: updatedBackup.createdBy?.name || null,
            notes: updatedBackup.notes,
            status: updatedBackup.status
        };
    } catch (error: any) {
        // Update backup record as failed
        await prisma.backup.update({
            where: { id: backup.id },
            data: { status: 'FAILED' }
        });

        console.error('Backup failed:', error);
        throw new Error(`Backup failed: ${error.message}`);
    }
}

export async function restoreBackup(backupId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const backup = await prisma.backup.findUnique({ where: { id: backupId } });

    if (!backup) {
        throw new Error('Backup not found');
    }

    const filepath = path.join(BACKUP_DIR, backup.filename);

    if (!fs.existsSync(filepath)) {
        throw new Error('Backup file not found on disk');
    }

    try {
        // Get database connection details
        const dbUrl = process.env.DATABASE_URL;
        let user, password, host, port, database;

        if (dbUrl) {
            const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
            if (match) {
                [, user, password, host, port, database] = match;
            }
        }

        // Fallback to individual env vars if URL parsing failed or URL not present
        if (!user) user = process.env.DB_USER || 'postgres';
        if (!password) password = process.env.DB_PASSWORD || 'postgres';
        if (!host) host = process.env.DB_HOST || 'db';
        if (!port) port = process.env.DB_PORT || '5432';
        if (!database) database = process.env.DB_NAME || 'catering_db';

        // Execute restore
        const restoreCommand = `PGPASSWORD="${password}" psql -h ${host} -p ${port} -U ${user} -d ${database} -f "${filepath}"`;

        await execAsync(restoreCommand);

        // Create audit log
        await logSystem(AuditAction.OTHER, `Database restored from: ${backup.filename}`, {
            entity: 'Backup',
            entityId: backupId,
            metadata: {
                filename: backup.filename,
                restoredBy: userId
            }
        });

        console.log(`✅ Database restored from: ${backup.filename}`);

        return {
            success: true,
            message: `Database berhasil direstore dari backup ${backup.filename}`
        };
    } catch (error: any) {
        console.error('Restore failed:', error);
        throw new Error(`Restore failed: ${error.message}`);
    }
}

export async function deleteBackup(backupId: string, userId: string): Promise<void> {
    const backup = await prisma.backup.findUnique({ where: { id: backupId } });

    if (!backup) {
        throw new Error('Backup not found');
    }

    const filepath = path.join(BACKUP_DIR, backup.filename);

    // Delete file if exists
    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
    }

    // Delete record
    await prisma.backup.delete({ where: { id: backupId } });

    // Create audit log
    await logSystem(AuditAction.OTHER, `Backup deleted: ${backup.filename}`, {
        entity: 'Backup',
        entityId: backupId,
        metadata: {
            filename: backup.filename,
            deletedBy: userId
        }
    });

    console.log(`🗑️ Backup deleted: ${backup.filename}`);
}

export async function cleanupOldBackups(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    const oldBackups = await prisma.backup.findMany({
        where: {
            createdAt: { lt: cutoffDate },
            status: 'COMPLETED'
        }
    });

    let deletedCount = 0;

    for (const backup of oldBackups) {
        try {
            const filepath = path.join(BACKUP_DIR, backup.filename);

            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }

            await prisma.backup.delete({ where: { id: backup.id } });
            deletedCount++;

            console.log(`🧹 Auto-deleted old backup: ${backup.filename}`);
        } catch (error) {
            console.error(`Failed to delete backup ${backup.filename}:`, error);
        }
    }

    if (deletedCount > 0) {
        console.log(`✅ Cleaned up ${deletedCount} old backups (older than ${RETENTION_DAYS} days)`);
    }

    return deletedCount;
}

export function getBackupFilePath(backupId: string): string | null {
    return path.join(BACKUP_DIR, backupId);
}

// ==================== SETTINGS & UPLOAD ====================

export async function getBackupSettings() {
    const settings = await prisma.settings.upsert({
        where: { id: 'default' },
        update: {},
        create: { id: 'default' }
    });

    return {
        autoBackupEnabled: settings.autoBackupEnabled,
        autoBackupInterval: settings.autoBackupInterval,
        lastAutoBackup: settings.lastAutoBackup
    };
}

export async function updateBackupSettings(enabled: boolean, interval: number) {
    return await prisma.settings.update({
        where: { id: 'default' },
        data: {
            autoBackupEnabled: enabled,
            autoBackupInterval: interval
        }
    });
}

export async function importBackupFile(userId: string, tempFilePath: string, originalFilename: string, size: number): Promise<BackupInfo> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = path.extname(originalFilename);
    const filename = `imported_${timestamp}${ext}`;
    const destinationPath = path.join(BACKUP_DIR, filename);

    // Move file
    await fs.promises.rename(tempFilePath, destinationPath);

    // Create backup record
    const backup = await prisma.backup.create({
        data: {
            filename,
            size,
            createdById: userId,
            notes: `Imported from: ${originalFilename}`,
            status: 'COMPLETED'
        },
        include: {
            createdBy: { select: { name: true } }
        }
    });

    // Audit log
    await logSystem(AuditAction.IMPORT_DATA, `Backup imported: ${filename}`, {
        entity: 'Backup',
        entityId: backup.id,
        metadata: {
            originalFilename,
            size,
            importedBy: userId
        }
    });

    return {
        id: backup.id,
        filename: backup.filename,
        filepath: destinationPath,
        size: backup.size,
        createdAt: backup.createdAt,
        createdById: backup.createdById,
        createdByName: backup.createdBy?.name || null,
        notes: backup.notes,
        status: backup.status
    };
}

// ==================== HELPERS ====================

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export { formatBytes, BACKUP_DIR, RETENTION_DAYS };
