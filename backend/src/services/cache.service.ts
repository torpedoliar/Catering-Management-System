import { prisma } from '../lib/prisma';
import { redisService } from './redis.service';

interface CacheOptions {
    ttl?: number; // Time to live in seconds
}

class CacheService {
    private readonly DEFAULT_TTL = 3600; // 1 hour
    // FIX-H2: In-flight fetch deduplication (prevents cache stampede)
    private inflightFetches: Map<string, Promise<any>> = new Map();

    // FIX-M1: Use redisService client instead of own connection
    private get client() {
        return redisService.getClient();
    }

    private get isReady() {
        return redisService.isReady();
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
            return true;
        } catch (error) {
            console.error(`[Cache] Set error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Delete a cached key or pattern.
     * FIX-M2: Uses SCAN instead of KEYS for production safety.
     */
    async delete(pattern: string): Promise<boolean> {
        if (!this.isReady || !this.client) {
            return false;
        }

        try {
            if (pattern.includes('*')) {
                // FIX-M2: Use SCAN cursor iteration instead of KEYS (O(n) blocking)
                let cursor = 0;
                do {
                    const result = await this.client.scan(cursor, { MATCH: pattern, COUNT: 100 });
                    cursor = result.cursor;
                    if (result.keys.length > 0) {
                        await this.client.del(result.keys);
                    }
                } while (cursor !== 0);
            } else {
                await this.client.del(pattern);
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
            return true;
        } catch (error) {
            console.error('[Cache] Clear error:', error);
            return false;
        }
    }

    /**
     * Wrapper for get-or-set pattern.
     * FIX-H2: Per-key Promise deduplication prevents cache stampede.
     * When TTL expires, only 1 request fetches; others await the same Promise.
     */
    async getOrSet<T>(
        key: string,
        fetchFn: () => Promise<T>,
        options?: CacheOptions
    ): Promise<T> {
        // Try to get from cache first
        const cached = await this.get<T>(key);
        if (cached !== null) {
            return cached;
        }

        // FIX-H2: Check if another request is already fetching this key
        const inflight = this.inflightFetches.get(key);
        if (inflight) {
            return inflight as Promise<T>;
        }

        // We're the first — start fetch and store the Promise
        const fetchPromise = fetchFn()
            .then(async (data) => {
                // Store in cache (fire and forget - don't await)
                this.set(key, data, options).catch(err =>
                    console.error(`[Cache] Background set failed for ${key}:`, err)
                );
                return data;
            })
            .finally(() => {
                // Clean up inflight entry
                this.inflightFetches.delete(key);
            });

        this.inflightFetches.set(key, fetchPromise);
        return fetchPromise;
    }

    isConnected(): boolean {
        return this.isReady && this.client !== null;
    }

    // FIX-M1: disconnect is now a no-op — redisService owns the connection
    async disconnect() {
        // No-op: redisService manages the Redis lifecycle
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
    DASHBOARD_STATS: (date: string) => `dashboard:stats:${date}`,
    DASHBOARD_STATS_RANGE: (start: string, end: string) => `dashboard:stats:range:${start}:${end}`,
};

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
    SHIFTS: 3600,      // 1 hour
    SETTINGS: 1800,    // 30 minutes
    HOLIDAYS: 3600,    // 1 hour
    USER_SHIFTS: 900,  // 15 minutes
    DASHBOARD_STATS: 60,  // 1 minute (dashboard updates frequently)
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
