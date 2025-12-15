import { redisService } from './redis.service';

interface RateLimitInfo {
    attempts: number;
    firstAttemptTime: number;
    lockedUntil?: number;
}

interface RateLimitResult {
    allowed: boolean;
    remainingTime?: number;
    reason?: string;
}

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

    async checkRateLimit(externalId: string, ip: string): Promise<RateLimitResult> {
        if (!redisService.isReady()) {
            console.warn('[RateLimiter] Redis not available, allowing request');
            return { allowed: true };
        }

        const client = redisService.getClient();
        if (!client) {
            return { allowed: true };
        }

        try {
            // Check both user and IP rate limits
            const [userCheck, ipCheck] = await Promise.all([
                this.checkKey(this.getUserKey(externalId), client),
                this.checkKey(this.getIPKey(ip), client)
            ]);

            if (!userCheck.allowed) {
                return userCheck;
            }

            if (!ipCheck.allowed) {
                return ipCheck;
            }

            return { allowed: true };
        } catch (error) {
            console.error('[RateLimiter] Error checking rate limit:', error);
            return { allowed: true }; // Fail open
        }
    }

    private async checkKey(key: string, client: any): Promise<RateLimitResult> {
        const data = await client.get(key);
        if (!data) {
            return { allowed: true };
        }

        const info: RateLimitInfo = JSON.parse(data);
        const now = Date.now();

        // If locked, check if lock has expired
        if (info.lockedUntil && info.lockedUntil > now) {
            const remainingSeconds = Math.ceil((info.lockedUntil - now) / 1000);
            return {
                allowed: false,
                remainingTime: remainingSeconds,
                reason: `Terlalu banyak percobaan login. Coba lagi dalam ${remainingSeconds} detik.`
            };
        }

        // If window expired, allow
        if (now - info.firstAttemptTime > WINDOW_DURATION_SECONDS * 1000) {
            return { allowed: true };
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
                this.incrementKey(this.getUserKey(externalId), client),
                this.incrementKey(this.getIPKey(ip), client)
            ]);
        } catch (error) {
            console.error('[RateLimiter] Error recording failed attempt:', error);
        }
    }

    private async incrementKey(key: string, client: any): Promise<void> {
        const data = await client.get(key);
        const now = Date.now();
        let info: RateLimitInfo;

        if (!data) {
            info = {
                attempts: 1,
                firstAttemptTime: now
            };
        } else {
            info = JSON.parse(data);

            // Reset if window expired
            if (now - info.firstAttemptTime > WINDOW_DURATION_SECONDS * 1000) {
                info = {
                    attempts: 1,
                    firstAttemptTime: now
                };
            } else {
                info.attempts += 1;

                // Lock if max attempts reached
                if (info.attempts >= MAX_ATTEMPTS) {
                    info.lockedUntil = now + (LOCKOUT_DURATION_SECONDS * 1000);
                }
            }
        }

        // Set with TTL
        const ttl = info.lockedUntil
            ? LOCKOUT_DURATION_SECONDS
            : WINDOW_DURATION_SECONDS;

        await client.setEx(key, ttl, JSON.stringify(info));
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
                client.del(this.getIPKey(ip))
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

            const userAttempts = userData ? JSON.parse(userData).attempts : 0;
            const ipAttempts = ipData ? JSON.parse(ipData).attempts : 0;

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

            const userAttempts = userData ? JSON.parse(userData).attempts : 0;
            const ipAttempts = ipData ? JSON.parse(ipData).attempts : 0;

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
