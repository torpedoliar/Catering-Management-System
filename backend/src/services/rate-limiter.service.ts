import { redisService } from './redis.service';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 60; // 1 minute
const WINDOW_DURATION_SECONDS = 300; // 5 minutes

class RateLimiterService {
    private getUserKey(externalId: string): string {
        return `login:attempt:user:${externalId}`;
    }

    private getIPKey(ip: string): string {
        return `login:attempt:ip:${ip}`;
    }

    private getUserLockKey(externalId: string): string {
        return `login:lock:user:${externalId}`;
    }

    private getIPLockKey(ip: string): string {
        return `login:lock:ip:${ip}`;
    }

    async checkRateLimit(externalId: string, ip: string): Promise<{ allowed: boolean; remainingTime?: number; reason?: string }> {
        if (!redisService.isReady()) {
            return { allowed: true };
        }

        const client = redisService.getClient();
        if (!client) {
            return { allowed: true };
        }

        try {
            const [userCheck, ipCheck] = await Promise.all([
                this.checkKey(this.getUserKey(externalId), this.getUserLockKey(externalId), client),
                this.checkKey(this.getIPKey(ip), this.getIPLockKey(ip), client)
            ]);

            if (!userCheck.allowed) return userCheck;
            if (!ipCheck.allowed) return ipCheck;

            return { allowed: true };
        } catch (error) {
            console.error('[RateLimiter] Error checking rate limit:', error);
            return { allowed: true }; // Fail open
        }
    }

    // FIX-M6: Atomic check — no get-parse-modify-set race
    private async checkKey(attemptsKey: string, lockKey: string, client: any): Promise<{ allowed: boolean; remainingTime?: number; reason?: string }> {
        // Check lock first (atomic GET)
        const lockTTL = await client.ttl(lockKey);
        if (lockTTL > 0) {
            return {
                allowed: false,
                remainingTime: lockTTL,
                reason: `Terlalu banyak percobaan login. Coba lagi dalam ${lockTTL} detik.`
            };
        }

        return { allowed: true };
    }

    async recordFailedAttempt(externalId: string, ip: string): Promise<void> {
        if (!redisService.isReady()) {
            return;
        }

        const client = redisService.getClient();
        if (!client) {
            return;
        }

        try {
            await Promise.all([
                this.incrementKey(this.getUserKey(externalId), this.getUserLockKey(externalId), client),
                this.incrementKey(this.getIPKey(ip), this.getIPLockKey(ip), client)
            ]);
        } catch (error) {
            console.error('[RateLimiter] Error recording failed attempt:', error);
        }
    }

    // FIX-M6: Atomic INCR + EXPIRE — no race condition
    private async incrementKey(attemptsKey: string, lockKey: string, client: any): Promise<void> {
        // Atomic increment
        const count = await client.incr(attemptsKey);

        // Set expiry on first attempt (atomic: key just created by INCR)
        if (count === 1) {
            await client.expire(attemptsKey, WINDOW_DURATION_SECONDS);
        }

        // Lock if max attempts reached
        if (count >= MAX_ATTEMPTS) {
            await client.set(lockKey, '1', { EX: LOCKOUT_DURATION_SECONDS });
            // Clean up attempts key
            await client.del(attemptsKey);
        }
    }

    async resetAttempts(externalId: string, ip: string): Promise<void> {
        if (!redisService.isReady()) {
            return;
        }

        const client = redisService.getClient();
        if (!client) {
            return;
        }

        try {
            await Promise.all([
                client.del(this.getUserKey(externalId)),
                client.del(this.getIPKey(ip)),
                client.del(this.getUserLockKey(externalId)),
                client.del(this.getIPLockKey(ip))
            ]);
        } catch (error) {
            console.error('[RateLimiter] Error resetting attempts:', error);
        }
    }

    async getRemainingAttempts(externalId: string, ip: string): Promise<{ user: number; ip: number }> {
        if (!redisService.isReady()) {
            return { user: MAX_ATTEMPTS, ip: MAX_ATTEMPTS };
        }

        const client = redisService.getClient();
        if (!client) {
            return { user: MAX_ATTEMPTS, ip: MAX_ATTEMPTS };
        }

        try {
            const [userData, ipData] = await Promise.all([
                client.get(this.getUserKey(externalId)),
                client.get(this.getIPKey(ip))
            ]);

            const userAttempts = userData ? parseInt(userData, 10) : 0;
            const ipAttempts = ipData ? parseInt(ipData, 10) : 0;

            return {
                user: Math.max(0, MAX_ATTEMPTS - userAttempts),
                ip: Math.max(0, MAX_ATTEMPTS - ipAttempts)
            };
        } catch (error) {
            console.error('[RateLimiter] Error getting remaining attempts:', error);
            return { user: MAX_ATTEMPTS, ip: MAX_ATTEMPTS };
        }
    }

    async getCurrentAttempts(externalId: string, ip: string): Promise<{ user: number; ip: number }> {
        if (!redisService.isReady()) {
            return { user: 0, ip: 0 };
        }

        const client = redisService.getClient();
        if (!client) {
            return { user: 0, ip: 0 };
        }

        try {
            const [userData, ipData] = await Promise.all([
                client.get(this.getUserKey(externalId)),
                client.get(this.getIPKey(ip))
            ]);

            const userAttempts = userData ? parseInt(userData, 10) : 0;
            const ipAttempts = ipData ? parseInt(ipData, 10) : 0;

            return { user: userAttempts, ip: ipAttempts };
        } catch (error) {
            console.error('[RateLimiter] Error getting current attempts:', error);
            return { user: 0, ip: 0 };
        }
    }
}

export const rateLimiter = new RateLimiterService();

// ============================================
// Generic API Rate Limiting
// ============================================

interface ApiRateLimitConfig {
    maxRequests: number;
    windowSeconds: number;
}

const API_RATE_LIMITS: Record<string, ApiRateLimitConfig> = {
    'bulk-order': { maxRequests: 10, windowSeconds: 60 },
    'export': { maxRequests: 5, windowSeconds: 60 },
    'upload': { maxRequests: 20, windowSeconds: 60 },
    'default': { maxRequests: 100, windowSeconds: 60 },
};

/**
 * Check if an API request is rate limited
 * @param userId - User ID making the request
 * @param endpoint - Rate limit category (bulk-order, export, upload, default)
 * @returns Object with allowed status and remaining info
 */
export async function checkApiRateLimit(
    userId: string,
    endpoint: keyof typeof API_RATE_LIMITS = 'default'
): Promise<{ allowed: boolean; remaining: number; resetIn?: number }> {
    if (!redisService.isReady()) {
        return { allowed: true, remaining: 999 };
    }

    const client = redisService.getClient();
    if (!client) {
        return { allowed: true, remaining: 999 };
    }

    const config = API_RATE_LIMITS[endpoint] || API_RATE_LIMITS['default'];
    const key = `api:ratelimit:${endpoint}:${userId}`;

    try {
        const current = await client.get(key);
        const count = current ? parseInt(current, 10) : 0;

        if (count >= config.maxRequests) {
            const ttl = await client.ttl(key);
            return {
                allowed: false,
                remaining: 0,
                resetIn: ttl > 0 ? ttl : config.windowSeconds,
            };
        }

        // Increment counter
        const multi = client.multi();
        multi.incr(key);
        if (count === 0) {
            multi.expire(key, config.windowSeconds);
        }
        await multi.exec();

        return {
            allowed: true,
            remaining: config.maxRequests - count - 1,
        };
    } catch (error) {
        console.error('[ApiRateLimiter] Error:', error);
        return { allowed: true, remaining: 999 }; // Fail open
    }
}

/**
 * Express middleware for API rate limiting
 */
export function apiRateLimitMiddleware(endpoint: keyof typeof API_RATE_LIMITS = 'default') {
    return async (req: any, res: any, next: any) => {
        const userId = req.user?.id || req.ip;
        const result = await checkApiRateLimit(userId, endpoint);

        // Set rate limit headers
        res.set('X-RateLimit-Remaining', result.remaining.toString());

        if (!result.allowed) {
            res.set('Retry-After', result.resetIn?.toString() || '60');
            return res.status(429).json({
                error: 'Terlalu banyak permintaan. Silakan coba lagi nanti.',
                code: 'RATE_LIMITED',
                retryAfter: result.resetIn,
            });
        }

        next();
    };
}
