import { Request, Response, NextFunction } from 'express';
import { redisService } from '../services/redis.service';

interface RateLimitOptions {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;   // Maximum requests per window
    keyPrefix: string;     // Redis key prefix
    message?: string;      // Custom error message
    skipFailedRequests?: boolean;
    keyGenerator?: (req: Request) => string;
}

interface RateLimitInfo {
    remaining: number;
    resetTime: number;
    total: number;
}

/**
 * Redis-backed rate limiter middleware
 * Scales across multiple backend instances
 */
export function rateLimiter(options: RateLimitOptions) {
    const {
        windowMs,
        maxRequests,
        keyPrefix,
        message = 'Too many requests, please try again later',
        skipFailedRequests = false,
        keyGenerator = defaultKeyGenerator,
    } = options;

    return async (req: Request, res: Response, next: NextFunction) => {
        const redis = redisService.getClient();

        // Skip rate limiting if Redis is not available
        if (!redis || !redisService.isReady()) {
            console.warn('[RateLimit] Redis not available, skipping rate limit');
            return next();
        }

        try {
            const key = `${keyPrefix}:${keyGenerator(req)}`;
            const now = Date.now();
            const windowStart = now - windowMs;

            // Use Redis sorted set for sliding window rate limiting
            const pipeline = redis.multi();

            // Remove old entries outside the window
            pipeline.zRemRangeByScore(key, 0, windowStart);

            // Count requests in current window
            pipeline.zCard(key);

            // Add current request
            pipeline.zAdd(key, { score: now, value: `${now}:${Math.random()}` });

            // Set expiry on the key
            pipeline.expire(key, Math.ceil(windowMs / 1000));

            const results = await pipeline.exec();
            const requestCount = (results?.[1] as number) || 0;

            // Calculate rate limit info
            const limitInfo: RateLimitInfo = {
                remaining: Math.max(0, maxRequests - requestCount - 1),
                resetTime: now + windowMs,
                total: maxRequests,
            };

            // Set rate limit headers
            res.setHeader('X-RateLimit-Limit', limitInfo.total);
            res.setHeader('X-RateLimit-Remaining', limitInfo.remaining);
            res.setHeader('X-RateLimit-Reset', Math.ceil(limitInfo.resetTime / 1000));

            // Check if limit exceeded
            if (requestCount >= maxRequests) {
                const retryAfter = Math.ceil(windowMs / 1000);
                res.setHeader('Retry-After', retryAfter);

                console.warn(`[RateLimit] Limit exceeded for ${key}: ${requestCount}/${maxRequests}`);

                return res.status(429).json({
                    error: message,
                    retryAfter,
                    limit: maxRequests,
                    windowMs,
                });
            }

            next();
        } catch (error) {
            console.error('[RateLimit] Error:', error);
            // On error, allow the request (fail open)
            next();
        }
    };
}

/**
 * Default key generator: uses IP address
 */
function defaultKeyGenerator(req: Request): string {
    // Get real IP from behind proxy/load balancer
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        return Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Key generator: uses user ID (for authenticated routes)
 */
export function userKeyGenerator(req: Request): string {
    const authReq = req as any;
    if (authReq.user?.id) {
        return authReq.user.id;
    }
    return defaultKeyGenerator(req);
}

/**
 * Key generator: uses user ID + endpoint
 */
export function userEndpointKeyGenerator(req: Request): string {
    const authReq = req as any;
    const userId = authReq.user?.id || defaultKeyGenerator(req);
    return `${userId}:${req.method}:${req.path}`;
}

// Pre-configured rate limiters for different scenarios
export const RATE_LIMITS = {
    // Auth endpoints: Strict limit to prevent brute force
    AUTH: {
        windowMs: 60 * 1000,     // 1 minute
        maxRequests: 10,         // 10 attempts per minute
        keyPrefix: 'rl:auth',
        message: 'Too many login attempts, please wait a minute',
    },

    // Order creation: Moderate limit
    ORDER_CREATE: {
        windowMs: 60 * 1000,     // 1 minute
        maxRequests: 30,         // 30 orders per minute
        keyPrefix: 'rl:order:create',
        message: 'Too many order requests, please slow down',
    },

    // Check-in: Higher limit for canteen operators
    CHECKIN: {
        windowMs: 60 * 1000,     // 1 minute
        maxRequests: 120,        // 120 check-ins per minute (2/sec)
        keyPrefix: 'rl:checkin',
        message: 'Check-in rate limit exceeded',
    },

    // API general: For all other authenticated endpoints
    API_GENERAL: {
        windowMs: 60 * 1000,     // 1 minute
        maxRequests: 100,        // 100 requests per minute
        keyPrefix: 'rl:api',
        message: 'API rate limit exceeded',
    },

    // Admin endpoints: More lenient
    ADMIN: {
        windowMs: 60 * 1000,     // 1 minute
        maxRequests: 200,        // 200 requests per minute
        keyPrefix: 'rl:admin',
        message: 'Admin API rate limit exceeded',
    },

    // Bulk operations: Very strict
    BULK: {
        windowMs: 60 * 1000,     // 1 minute
        maxRequests: 5,          // 5 bulk operations per minute
        keyPrefix: 'rl:bulk',
        message: 'Bulk operation rate limit exceeded',
    },
};

// Export configured middleware instances
export const authRateLimiter = rateLimiter(RATE_LIMITS.AUTH);
export const orderCreateRateLimiter = rateLimiter({
    ...RATE_LIMITS.ORDER_CREATE,
    keyGenerator: userKeyGenerator,
});
export const checkinRateLimiter = rateLimiter({
    ...RATE_LIMITS.CHECKIN,
    keyGenerator: userKeyGenerator,
});
export const apiRateLimiter = rateLimiter({
    ...RATE_LIMITS.API_GENERAL,
    keyGenerator: userKeyGenerator,
});
export const adminRateLimiter = rateLimiter({
    ...RATE_LIMITS.ADMIN,
    keyGenerator: userKeyGenerator,
});
export const bulkRateLimiter = rateLimiter({
    ...RATE_LIMITS.BULK,
    keyGenerator: userKeyGenerator,
});
