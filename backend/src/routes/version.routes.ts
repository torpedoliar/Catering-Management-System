import { Router, Response } from 'express';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const router = Router();

// Repository config
const REPO_URL = 'https://raw.githubusercontent.com/torpedoliar/Catering-Management-System/main/version.json';

interface VersionInfo {
    version: string;
    releaseDate: string;
    minDatabaseVersion: string;
    changelog: string[];
    repository: string;
    branch: string;
}

// Read local version.json
function getLocalVersion(): VersionInfo | null {
    try {
        const versionPath = path.join(process.cwd(), 'version.json');

        // Fallback paths for Docker environment
        const possiblePaths = [
            versionPath,
            '/app/version.json',
            path.join(__dirname, '../../../version.json'),
            path.join(__dirname, '../../version.json')
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                const content = fs.readFileSync(p, 'utf-8');
                return JSON.parse(content);
            }
        }

        // Return default if no file found
        return {
            version: '1.5.0',
            releaseDate: '2026-01-06',
            minDatabaseVersion: '1.0.0',
            changelog: [],
            repository: 'https://github.com/torpedoliar/Catering-Management-System',
            branch: 'main'
        };
    } catch (error) {
        console.error('Error reading version.json:', error);
        return null;
    }
}

// Fetch remote version from GitHub
async function getRemoteVersion(): Promise<VersionInfo | null> {
    try {
        const response = await fetch(REPO_URL, {
            headers: { 'Cache-Control': 'no-cache' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json() as VersionInfo;
    } catch (error) {
        console.error('Error fetching remote version:', error);
        return null;
    }
}

// Compare versions (returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal)
function compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;

        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }

    return 0;
}

// GET /api/version - Get current version
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const localVersion = getLocalVersion();

        if (!localVersion) {
            return res.status(500).json({ error: 'Could not read version info' });
        }

        res.json({
            current: localVersion,
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        console.error('Get version error:', error);
        res.status(500).json({ error: 'Failed to get version info' });
    }
});

// GET /api/version/check - Check for updates
router.get('/check', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const localVersion = getLocalVersion();
        const remoteVersion = await getRemoteVersion();

        if (!localVersion) {
            return res.status(500).json({ error: 'Could not read local version' });
        }

        if (!remoteVersion) {
            return res.status(500).json({ error: 'Could not fetch remote version. Check internet connection.' });
        }

        const comparison = compareVersions(remoteVersion.version, localVersion.version);

        res.json({
            current: localVersion,
            latest: remoteVersion,
            updateAvailable: comparison > 0,
            isNewer: comparison < 0, // Local is ahead of remote (dev)
            isSame: comparison === 0
        });
    } catch (error) {
        console.error('Check version error:', error);
        res.status(500).json({ error: 'Failed to check for updates' });
    }
});

// Update status tracking
let updateStatus = {
    isUpdating: false,
    currentStep: '',
    progress: 0,
    error: null as string | null,
    logs: [] as string[],
    lastUpdate: null as Date | null
};

// GET /api/version/update-status - Get update progress
router.get('/update-status', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    res.json(updateStatus);
});

// POST /api/version/update - Trigger update (admin only)
router.post('/update', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    if (updateStatus.isUpdating) {
        return res.status(409).json({ error: 'Update already in progress' });
    }

    // Reset status
    updateStatus = {
        isUpdating: true,
        currentStep: 'Starting update...',
        progress: 0,
        error: null,
        logs: [],
        lastUpdate: new Date()
    };

    const addLog = (msg: string) => {
        updateStatus.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
        console.log(`[Update] ${msg}`);
    };

    // Run update in background
    (async () => {
        try {
            // Step 1: Git pull
            updateStatus.currentStep = 'Pulling latest code...';
            updateStatus.progress = 10;
            addLog('Executing git pull origin main...');

            const { stdout: gitOutput } = await execAsync('git pull origin main', {
                cwd: process.cwd()
            });
            addLog(gitOutput || 'Git pull completed');

            // Step 2: Database sync
            updateStatus.currentStep = 'Syncing database schema...';
            updateStatus.progress = 50;
            addLog('Running prisma db push...');

            try {
                const { stdout: prismaOutput } = await execAsync('npx prisma db push --accept-data-loss', {
                    cwd: process.cwd()
                });
                addLog(prismaOutput || 'Database schema synced');
            } catch (prismaError: any) {
                addLog(`Prisma warning (non-fatal): ${prismaError.message}`);
            }

            // Step 3: Generate Prisma client
            updateStatus.currentStep = 'Generating Prisma client...';
            updateStatus.progress = 70;
            addLog('Running prisma generate...');

            try {
                await execAsync('npx prisma generate', { cwd: process.cwd() });
                addLog('Prisma client generated');
            } catch (genError: any) {
                addLog(`Generate warning: ${genError.message}`);
            }

            // Step 4: Complete
            updateStatus.currentStep = 'Update complete! Server restart required.';
            updateStatus.progress = 100;
            addLog('Update completed successfully!');
            addLog('Please restart the container manually: docker restart catering-backend catering-frontend');

        } catch (error: any) {
            updateStatus.error = error.message;
            updateStatus.currentStep = 'Update failed';
            addLog(`ERROR: ${error.message}`);
        } finally {
            updateStatus.isUpdating = false;
        }
    })();

    res.json({
        message: 'Update started in background',
        statusEndpoint: '/api/version/update-status'
    });
});

// POST /api/version/restart - Request container restart (for after update)
router.post('/restart', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        // This will cause nodemon to restart the process
        // In production, we'd use a proper process manager
        res.json({
            message: 'Restart initiated. The server will be unavailable for a few seconds.',
            note: 'If running in Docker, manually restart containers: docker restart catering-backend catering-frontend'
        });

        // Delayed exit to allow response to be sent
        setTimeout(() => {
            console.log('[VERSION] Server restart requested');
            process.exit(0);
        }, 1000);
    } catch (error) {
        console.error('Restart error:', error);
        res.status(500).json({ error: 'Failed to initiate restart' });
    }
});

export default router;
