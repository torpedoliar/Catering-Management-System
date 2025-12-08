import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import http from 'http';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

interface NTPSettings {
    ntpEnabled: boolean;
    ntpServer: string;
    ntpTimezone: string;
    ntpSyncInterval: number;
    ntpLastSync: Date | null;
    ntpOffset: number;
}

interface TimeInfo {
    serverTime: string;
    formattedTime: string;
    formattedDate: string;
    timestamp: number;
    timezone: string;
    ntpEnabled: boolean;
    ntpServer: string;
    lastSync: string | null;
    offset: number;
    isSynced: boolean;
}

let cachedOffset = 0;
let cachedTimezone = 'Asia/Jakarta';
let lastSyncTime: Date | null = null;
let syncInterval: NodeJS.Timeout | null = null;

/**
 * Get timezone offset in milliseconds for a given timezone
 */
function getTimezoneOffset(timezone: string): number {
    const offsets: Record<string, number> = {
        'Asia/Jakarta': 7 * 60 * 60 * 1000,      // UTC+7
        'Asia/Makassar': 8 * 60 * 60 * 1000,     // UTC+8
        'Asia/Jayapura': 9 * 60 * 60 * 1000,     // UTC+9
        'Asia/Singapore': 8 * 60 * 60 * 1000,    // UTC+8
        'Asia/Kuala_Lumpur': 8 * 60 * 60 * 1000, // UTC+8
        'Asia/Bangkok': 7 * 60 * 60 * 1000,      // UTC+7
        'Asia/Ho_Chi_Minh': 7 * 60 * 60 * 1000,  // UTC+7
        'Asia/Manila': 8 * 60 * 60 * 1000,       // UTC+8
        'Asia/Tokyo': 9 * 60 * 60 * 1000,        // UTC+9
        'Asia/Seoul': 9 * 60 * 60 * 1000,        // UTC+9
        'Asia/Shanghai': 8 * 60 * 60 * 1000,     // UTC+8
        'Asia/Hong_Kong': 8 * 60 * 60 * 1000,    // UTC+8
        'Asia/Taipei': 8 * 60 * 60 * 1000,       // UTC+8
        'Asia/Kolkata': 5.5 * 60 * 60 * 1000,    // UTC+5:30
        'Asia/Dubai': 4 * 60 * 60 * 1000,        // UTC+4
        'Europe/London': 0,                       // UTC+0
        'Europe/Paris': 1 * 60 * 60 * 1000,      // UTC+1
        'Europe/Berlin': 1 * 60 * 60 * 1000,     // UTC+1
        'America/New_York': -5 * 60 * 60 * 1000, // UTC-5
        'America/Los_Angeles': -8 * 60 * 60 * 1000, // UTC-8
        'America/Chicago': -6 * 60 * 60 * 1000,  // UTC-6
        'Australia/Sydney': 10 * 60 * 60 * 1000, // UTC+10
        'Pacific/Auckland': 12 * 60 * 60 * 1000, // UTC+12
        'UTC': 0,
    };
    return offsets[timezone] || 7 * 60 * 60 * 1000; // Default to Jakarta (UTC+7)
}

/**
 * Get current time adjusted with NTP offset in configured timezone
 */
export function getNow(): Date {
    const now = new Date();
    // Apply NTP offset
    const adjustedTime = new Date(now.getTime() + cachedOffset);
    
    // Convert UTC to configured timezone
    const utcTime = adjustedTime.getTime() + (adjustedTime.getTimezoneOffset() * 60 * 1000);
    const tzOffset = getTimezoneOffset(cachedTimezone);
    
    return new Date(utcTime + tzOffset);
}

/**
 * Get current timezone
 */
export function getTimezone(): string {
    return cachedTimezone;
}

/**
 * Get today's date at midnight in configured timezone
 */
export function getToday(): Date {
    const now = getNow();
    now.setHours(0, 0, 0, 0);
    return now;
}

/**
 * Get tomorrow's date at midnight in configured timezone
 */
export function getTomorrow(): Date {
    const today = getToday();
    today.setDate(today.getDate() + 1);
    return today;
}

/**
 * Create a date object for a specific time (HH:mm) today in configured timezone
 */
export function getTimeToday(timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const today = getToday();
    today.setHours(hours, minutes, 0, 0);
    return today;
}

/**
 * Check if current time is past a cutoff time for a shift (for TODAY only)
 */
export function isPastCutoff(shiftStartTime: string, cutoffHours: number): { isPast: boolean; cutoffTime: Date; shiftStart: Date; now: Date; minutesUntilCutoff: number } {
    const now = getNow();
    const shiftStart = getTimeToday(shiftStartTime);
    const cutoffTime = new Date(shiftStart.getTime() - (cutoffHours * 60 * 60 * 1000));
    const minutesUntilCutoff = Math.max(0, Math.floor((cutoffTime.getTime() - now.getTime()) / 60000));
    
    return {
        isPast: now >= cutoffTime,
        cutoffTime,
        shiftStart,
        now,
        minutesUntilCutoff
    };
}

/**
 * Check if current time is past a cutoff time for a shift on a SPECIFIC DATE
 * This is used for orders that may be for future dates
 */
export function isPastCutoffForDate(orderDate: Date, shiftStartTime: string, cutoffHours: number): { isPast: boolean; cutoffTime: Date; shiftStart: Date; now: Date; minutesUntilCutoff: number } {
    const now = getNow();
    
    // Parse order date (normalize to start of day)
    const orderDay = new Date(orderDate);
    orderDay.setHours(0, 0, 0, 0);
    
    // Parse shift start time
    const [hours, minutes] = shiftStartTime.split(':').map(Number);
    
    // Create shift start time on the order date
    const shiftStart = new Date(orderDay);
    shiftStart.setHours(hours, minutes, 0, 0);
    
    // Calculate cutoff time (X hours before shift start)
    const cutoffTime = new Date(shiftStart.getTime() - (cutoffHours * 60 * 60 * 1000));
    
    // Calculate minutes until cutoff
    const minutesUntilCutoff = Math.max(0, Math.floor((cutoffTime.getTime() - now.getTime()) / 60000));
    
    return {
        isPast: now >= cutoffTime,
        cutoffTime,
        shiftStart,
        now,
        minutesUntilCutoff
    };
}

/**
 * Query NTP server using w32tm (Windows) or sntp/ntpdate (Linux)
 */
async function queryNTPServer(server: string): Promise<number> {
    const isWindows = process.platform === 'win32';
    
    try {
        if (isWindows) {
            // Use w32tm on Windows
            const { stdout } = await execAsync(`w32tm /stripchart /computer:${server} /dataonly /samples:1`, {
                timeout: 10000
            });
            
            // Parse the offset from output (format: "time, offset")
            const lines = stdout.split('\n').filter(line => line.includes(','));
            if (lines.length > 0) {
                const match = lines[lines.length - 1].match(/([+-]?\d+\.?\d*)s/);
                if (match) {
                    return parseFloat(match[1]) * 1000; // Convert to milliseconds
                }
            }
        } else {
            // Try multiple NTP query methods on Linux/Mac/Alpine
            const commands = [
                { cmd: `sntp -t 5 ${server}`, regex: /([+-]?\d+\.?\d+)\s*s/ },
                { cmd: `ntpdate -q ${server}`, regex: /offset\s+([+-]?\d+\.?\d+)/ },
                { cmd: `ntpd -q -n -d ${server}`, regex: /offset\s+([+-]?\d+\.?\d+)/ },
            ];
            
            for (const { cmd, regex } of commands) {
                try {
                    const { stdout } = await execAsync(cmd, { timeout: 15000 });
                    const match = stdout.match(regex);
                    if (match) {
                        return parseFloat(match[1]) * 1000;
                    }
                } catch {
                    // Try next command
                }
            }
        }
    } catch (error) {
        console.log(`[NTP] Query to ${server} failed:`, error instanceof Error ? error.message : error);
    }
    
    return 0;
}

/**
 * Make HTTP/HTTPS request with promise
 */
function httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const request = client.get(url, { timeout: 10000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        request.on('error', reject);
        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Alternative NTP sync using HTTP time API
 */
async function queryHTTPTime(): Promise<number> {
    const apis = [
        // Use UTC endpoints to avoid timezone confusion
        { url: 'http://worldtimeapi.org/api/timezone/Etc/UTC', parser: (data: any) => data.unixtime * 1000 },
        { url: 'https://worldtimeapi.org/api/timezone/Etc/UTC', parser: (data: any) => data.unixtime * 1000 },
        { url: 'https://timeapi.io/api/Time/current/zone?timeZone=UTC', parser: (data: any) => {
            // timeapi returns local time without TZ, so we need to parse it as UTC
            const dt = data.dateTime; // "2025-12-06T02:45:00"
            return new Date(dt + 'Z').getTime();
        }},
    ];

    for (const api of apis) {
        try {
            const startTime = Date.now();
            const response = await httpGet(api.url);
            const endTime = Date.now();
            const latency = (endTime - startTime) / 2;
            
            const data = JSON.parse(response);
            const serverTime = api.parser(data);
            
            if (!isNaN(serverTime)) {
                const localTime = Date.now();
                const offset = serverTime - localTime + latency;
                console.log(`[NTP] HTTP sync successful with ${api.url}, offset: ${offset}ms`);
                return offset;
            }
        } catch (error) {
            console.log(`[NTP] HTTP time query failed for ${api.url}:`, error instanceof Error ? error.message : error);
        }
    }
    
    console.log('[NTP] All HTTP time APIs failed, using system time');
    return 0;
}

/**
 * Sync time with NTP server
 */
export async function syncNTP(): Promise<{ success: boolean; offset: number; error?: string }> {
    try {
        const settings = await prisma.settings.findUnique({
            where: { id: 'default' }
        });
        
        if (!settings?.ntpEnabled) {
            console.log('[NTP] NTP sync is disabled');
            return { success: true, offset: 0 };
        }
        
        const server = settings.ntpServer || 'pool.ntp.org';
        console.log(`[NTP] Syncing with ${server}...`);
        
        // Try NTP query first
        let offset = await queryNTPServer(server);
        
        // If NTP query failed, try HTTP fallback
        if (offset === 0) {
            console.log('[NTP] Falling back to HTTP time API...');
            offset = await queryHTTPTime();
        }
        
        cachedOffset = offset;
        lastSyncTime = new Date();
        
        // Update settings with sync info
        await prisma.settings.update({
            where: { id: 'default' },
            data: {
                ntpOffset: Math.round(offset),
                ntpLastSync: lastSyncTime
            }
        });
        
        console.log(`[NTP] Sync complete. Offset: ${offset}ms`);
        return { success: true, offset };
        
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[NTP] Sync failed:', message);
        return { success: false, offset: cachedOffset, error: message };
    }
}

/**
 * Helper function to delay execution
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Initialize NTP service with retry
 */
export async function initNTPService(): Promise<void> {
    try {
        // Load cached settings
        const settings = await prisma.settings.findUnique({
            where: { id: 'default' }
        });
        
        if (settings) {
            cachedOffset = settings.ntpOffset || 0;
            cachedTimezone = settings.ntpTimezone || 'Asia/Jakarta';
            lastSyncTime = settings.ntpLastSync;
            
            console.log(`[NTP] Using timezone: ${cachedTimezone}`);
            
            if (settings.ntpEnabled) {
                // Wait for network to be ready (especially in Docker)
                console.log('[NTP] Waiting for network...');
                await delay(3000);
                
                // Initial sync with retry
                let syncSuccess = false;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    console.log(`[NTP] Sync attempt ${attempt}/3...`);
                    const result = await syncNTP();
                    if (result.success && result.offset !== 0) {
                        syncSuccess = true;
                        break;
                    }
                    if (attempt < 3) {
                        await delay(2000);
                    }
                }
                
                if (!syncSuccess) {
                    console.log('[NTP] Initial sync failed, will retry on next scheduled interval');
                }
                
                // Schedule periodic sync
                startNTPScheduler(settings.ntpSyncInterval);
            }
        }
        
        console.log('[NTP] Service initialized');
    } catch (error) {
        console.error('[NTP] Failed to initialize:', error);
    }
}

/**
 * Start NTP sync scheduler
 */
export function startNTPScheduler(intervalSeconds: number): void {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    syncInterval = setInterval(async () => {
        await syncNTP();
    }, intervalSeconds * 1000);
    
    console.log(`[NTP] Scheduler started (interval: ${intervalSeconds}s)`);
}

/**
 * Stop NTP sync scheduler
 */
export function stopNTPScheduler(): void {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('[NTP] Scheduler stopped');
    }
}

/**
 * Get NTP settings
 */
export async function getNTPSettings(): Promise<NTPSettings> {
    const settings = await prisma.settings.findUnique({
        where: { id: 'default' }
    });
    
    return {
        ntpEnabled: settings?.ntpEnabled ?? true,
        ntpServer: settings?.ntpServer ?? 'pool.ntp.org',
        ntpTimezone: settings?.ntpTimezone ?? 'Asia/Jakarta',
        ntpSyncInterval: settings?.ntpSyncInterval ?? 3600,
        ntpLastSync: settings?.ntpLastSync ?? null,
        ntpOffset: settings?.ntpOffset ?? 0
    };
}

/**
 * Update NTP settings
 */
export async function updateNTPSettings(data: Partial<NTPSettings>): Promise<NTPSettings> {
    const settings = await prisma.settings.upsert({
        where: { id: 'default' },
        update: {
            ...(data.ntpEnabled !== undefined && { ntpEnabled: data.ntpEnabled }),
            ...(data.ntpServer !== undefined && { ntpServer: data.ntpServer }),
            ...(data.ntpTimezone !== undefined && { ntpTimezone: data.ntpTimezone }),
            ...(data.ntpSyncInterval !== undefined && { ntpSyncInterval: data.ntpSyncInterval })
        },
        create: {
            id: 'default',
            ntpEnabled: data.ntpEnabled ?? true,
            ntpServer: data.ntpServer ?? 'pool.ntp.org',
            ntpTimezone: data.ntpTimezone ?? 'Asia/Jakarta',
            ntpSyncInterval: data.ntpSyncInterval ?? 3600
        }
    });
    
    // Update cached timezone if changed
    if (data.ntpTimezone) {
        cachedTimezone = data.ntpTimezone;
        console.log(`[NTP] Timezone updated to: ${cachedTimezone}`);
    }
    
    // Update scheduler if interval changed
    if (data.ntpSyncInterval && settings.ntpEnabled) {
        startNTPScheduler(data.ntpSyncInterval);
    }
    
    // Stop/start based on enabled state
    if (data.ntpEnabled === false) {
        stopNTPScheduler();
        cachedOffset = 0;
    } else if (data.ntpEnabled === true) {
        await syncNTP();
        startNTPScheduler(settings.ntpSyncInterval);
    }
    
    return {
        ntpEnabled: settings.ntpEnabled,
        ntpServer: settings.ntpServer,
        ntpTimezone: settings.ntpTimezone,
        ntpSyncInterval: settings.ntpSyncInterval,
        ntpLastSync: settings.ntpLastSync,
        ntpOffset: settings.ntpOffset
    };
}

/**
 * Get current time info
 */
export async function getTimeInfo(): Promise<TimeInfo> {
    const settings = await getNTPSettings();
    const now = getNow();
    
    // Format time components for display (already in configured timezone)
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const formattedTime = `${hours}:${minutes}:${seconds}`;
    
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    
    return {
        serverTime: now.toISOString(),
        formattedTime,
        formattedDate,
        timestamp: now.getTime(),
        timezone: settings.ntpTimezone,
        ntpEnabled: settings.ntpEnabled,
        ntpServer: settings.ntpServer,
        lastSync: settings.ntpLastSync?.toISOString() ?? null,
        offset: settings.ntpOffset,
        isSynced: lastSyncTime !== null
    };
}

/**
 * Get available timezone list
 */
export function getTimezones(): string[] {
    return [
        'Asia/Jakarta',
        'Asia/Makassar',
        'Asia/Jayapura',
        'Asia/Singapore',
        'Asia/Kuala_Lumpur',
        'Asia/Bangkok',
        'Asia/Ho_Chi_Minh',
        'Asia/Manila',
        'Asia/Tokyo',
        'Asia/Seoul',
        'Asia/Shanghai',
        'Asia/Hong_Kong',
        'Asia/Taipei',
        'Asia/Kolkata',
        'Asia/Dubai',
        'Europe/London',
        'Europe/Paris',
        'Europe/Berlin',
        'America/New_York',
        'America/Los_Angeles',
        'America/Chicago',
        'Australia/Sydney',
        'Pacific/Auckland',
        'UTC'
    ];
}

/**
 * Get common NTP servers
 */
export function getNTPServers(): { name: string; address: string }[] {
    return [
        { name: 'Pool NTP (Global)', address: 'pool.ntp.org' },
        { name: 'Indonesia NTP Pool', address: 'id.pool.ntp.org' },
        { name: 'Asia NTP Pool', address: 'asia.pool.ntp.org' },
        { name: 'Google NTP', address: 'time.google.com' },
        { name: 'Cloudflare NTP', address: 'time.cloudflare.com' },
        { name: 'Microsoft NTP', address: 'time.windows.com' },
        { name: 'Apple NTP', address: 'time.apple.com' },
        { name: 'NIST NTP', address: 'time.nist.gov' }
    ];
}
