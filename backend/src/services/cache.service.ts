import { createClient, RedisClientType } from 'redis';
import { prisma } from '../lib/prisma';

interface CacheOptions {
    ttl?: number; // Time to live in seconds
}

class CacheService {
    private client: RedisClientType | null = null;
    private isReady = false;
    private readonly DEFAULT_TTL = 3600; // 1 hour

    async connect() {
        if (this.isReady && this.client) {
            return this.client;
        }

        try {
            this.client = createClient({
                url: process.env.REDIS_URL || 'redis://catering-redis:6379',
                socket: {
                    reconnectStrategy: (retries: number) => {
                        if (retries > 10) {
                            console.error('[Cache] Max reconnection attempts reached');
                            return new Error('Max reconnection attempts');
                        }
                        return Math.min(retries * 100, 3000);
                    }
                }
            }) as RedisClientType;

            this.client.on('error', (err: Error) => {
                console.error('[Cache] Error:', err);
                this.isReady = false;
            });

            this.client.on('ready', () => {
                console.log('[Cache] Ready');
                this.isReady = true;
            });

            await this.client.connect();
            return this.client;
        } catch (error) {
            console.error('[Cache] Connection failed:', error);
            this.isReady = false;
            return null;
        }
    }

    /**
     * Get cached data. Returns null if not found or cache unavailable.
     */
    async get<T>(key: string): Promise<T | null> {
        if (!this.isReady || !this.client) {
            return null;
        }

        try {
            const data = await this.client.get(key);
            if (!data) return null;
            return JSON.parse(data) as T;
        } catch (error) {
            console.error(`[Cache] Get error for key ${key}:`, error);
            return null;
        }
    }

    /**
     * Set cached data with optional TTL.
     */
    async set(key: string, value: any, options?: CacheOptions): Promise<boolean> {
        if (!this.isReady || !this.client) {
            return false;
        }

        try {
            const ttl = options?.ttl || this.DEFAULT_TTL;
            await this.client.setEx(key, ttl, JSON.stringify(value));
            console.log(`[Cache] Set key: ${key} (TTL: ${ttl}s)`);
            return true;
        } catch (error) {
            console.error(`[Cache] Set error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Delete a cached key or pattern.
     */
    async delete(pattern: string): Promise<boolean> {
        if (!this.isReady || !this.client) {
            return false;
        }

        try {
            // If pattern contains wildcard, delete all matching keys
            if (pattern.includes('*')) {
                const keys = await this.client.keys(pattern);
                if (keys.length > 0) {
                    await this.client.del(keys);
                    console.log(`[Cache] Deleted ${keys.length} keys matching ${pattern}`);
                }
            } else {
                await this.client.del(pattern);
                console.log(`[Cache] Deleted key: ${pattern}`);
            }
            return true;
        } catch (error) {
            console.error(`[Cache] Delete error for pattern ${pattern}:`, error);
            return false;
        }
    }

    /**
     * Clear all cache.
     */
    async clear(): Promise<boolean> {
        if (!this.isReady || !this.client) {
            return false;
        }

        try {
            await this.client.flushDb();
            console.log('[Cache] Database cleared');
            return true;
        } catch (error) {
            console.error('[Cache] Clear error:', error);
            return false;
        }
    }

    /**
     * Wrapper for get-or-set pattern.
     */
    async getOrSet<T>(
        key: string,
        fetchFn: () => Promise<T>,
        options?: CacheOptions
    ): Promise<T> {
        // Try to get from cache first
        const cached = await this.get<T>(key);
        if (cached !== null) {
            console.log(`[Cache] Hit: ${key}`);
            return cached;
        }

        // Cache miss - fetch data
        console.log(`[Cache] Miss: ${key}`);
        const data = await fetchFn();

        // Store in cache (fire and forget - don't await)
        this.set(key, data, options).catch(err =>
            console.error(`[Cache] Background set failed for ${key}:`, err)
        );

        return data;
    }

    isConnected(): boolean {
        return this.isReady && this.client !== null;
    }

    async disconnect() {
        if (this.client) {
            await this.client.quit();
            this.isReady = false;
            this.client = null;
        }
    }
}

// Singleton instance
export const cacheService = new CacheService();

// Cache key constants
export const CACHE_KEYS = {
    SHIFTS: 'shifts:all',
    SHIFTS_USER: (userId: string, date?: string) =>
        `shifts:user:${userId}${date ? `:${date}` : ''}`,
    SETTINGS: 'settings:default',
    HOLIDAYS: (date: string) => `holidays:${date}`,
};

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
    SHIFTS: 3600,      // 1 hour
    SETTINGS: 1800,    // 30 minutes
    HOLIDAYS: 3600,    // 1 hour
    USER_SHIFTS: 900,  // 15 minutes
};

/**
 * Get settings from cache with fallback to database.
 * Auto-creates default settings if not exists.
 */
export async function getCachedSettings() {
    return cacheService.getOrSet(
        CACHE_KEYS.SETTINGS,
        async () => {
            let settings = await prisma.settings.findUnique({
                where: { id: 'default' }
            });
            if (!settings) {
                settings = await prisma.settings.create({
                    data: {
                        id: 'default',
                        cutoffMode: 'per-shift',
                        cutoffDays: 0,
                        cutoffHours: 6,
                        maxOrderDaysAhead: 7,
                        weeklyCutoffDay: 5,
                        weeklyCutoffHour: 17,
                        weeklyCutoffMinute: 0,
                        orderableDays: '1,2,3,4,5,6',
                        maxWeeksAhead: 1,
                        blacklistStrikes: 3,
                        blacklistDuration: 7,
                    }
                });
            }
            return settings;
        },
        { ttl: CACHE_TTL.SETTINGS }
    );
}
