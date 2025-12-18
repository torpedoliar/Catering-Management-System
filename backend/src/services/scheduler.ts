import cron from 'node-cron';
import { processNoShows } from './noshow.service';
import { prisma } from '../lib/prisma';
import { createBackup } from './server.service';

let isSchedulerRunning = false;

/**
 * Start the no-show processing scheduler
 * Runs every hour at minute 5 (e.g., 15:05, 16:05, etc.)
 * This gives a 5-minute grace period after shift ends
 */
export function startScheduler() {
    if (isSchedulerRunning) {
        console.log('[Scheduler] Already running');
        return;
    }

    // Run at minute 5 of every hour (gives 5 min grace period after shift ends)
    cron.schedule('5 * * * *', async () => {
        console.log('[Scheduler] Running no-show check...');
        try {
            const result = await processNoShows();
            if (result.processedOrders > 0) {
                console.log(`[Scheduler] Processed ${result.processedOrders} no-shows, ${result.newBlacklists} blacklists`);
            }
        } catch (error) {
            console.error('[Scheduler] Error running no-show check:', error);
        }
    });

    // Run Auto Backup check daily at 02:00 AM
    cron.schedule('0 2 * * *', async () => {
        try {
            const settings = await prisma.settings.findUnique({ where: { id: 'default' } });
            if (!settings?.autoBackupEnabled) return;

            const now = new Date();
            const lastBackup = settings.lastAutoBackup ? new Date(settings.lastAutoBackup) : new Date(0);
            const intervalMs = settings.autoBackupInterval * 24 * 60 * 60 * 1000;

            if (now.getTime() - lastBackup.getTime() >= intervalMs) {
                console.log('[Scheduler] Running Auto Backup...');
                await createBackup('SYSTEM', 'Auto Backup');
                await prisma.settings.update({
                    where: { id: 'default' },
                    data: { lastAutoBackup: now }
                });
            }
        } catch (error) {
            console.error('[Scheduler] Auto Backup failed:', error);
        }
    });

    isSchedulerRunning = true;
    console.log('[Scheduler] No-show scheduler started (runs at :05 every hour)');
}

/**
 * Check if scheduler is running
 */
export function isSchedulerActive(): boolean {
    return isSchedulerRunning;
}
