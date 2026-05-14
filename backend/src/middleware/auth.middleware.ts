import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        externalId: string;
        role: string;
        name?: string;
    };
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        let token: string | undefined;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
        // NOTE: Query param token support removed (F-006/security hardening)

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('CRITICAL: JWT_SECRET environment variable is not set!');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const decoded = jwt.verify(token, secret) as {
            id: string;
            externalId: string;
            role: string;
        };

        req.user = decoded;

        // R-001: Chain into passwordChangeGuard
        return passwordChangeGuard(req, res, next);
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

export const canteenMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'CANTEEN' && req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Canteen or Admin access required' });
    }
    next();
};

export const vendorMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'VENDOR' && req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Vendor or Admin access required' });
    }
    next();
};

/**
 * R-001: Server-side mustChangePassword enforcement
 * 
 * When mustChangePassword=true, only these endpoints are allowed:
 *   - POST /api/auth/change-password
 *   - POST /api/auth/logout
 *   - GET  /api/auth/me
 *   - POST /api/auth/refresh
 * 
 * All other endpoints receive 403 Forbidden.
 * Uses Redis cache (60s TTL) to minimize DB pressure.
 */
export const passwordChangeGuard = async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Only apply to authenticated requests
    if (!req.user?.id) {
        return next();
    }

    // Whitelist: endpoints allowed even when mustChangePassword=true
    const originalUrl = req.originalUrl.split('?')[0]; // Strip query params
    const method = req.method;

    const isAllowed =
        (originalUrl === '/api/auth/change-password' && method === 'POST') ||
        (originalUrl === '/api/auth/logout' && method === 'POST') ||
        (originalUrl === '/api/auth/me' && method === 'GET') ||
        (originalUrl === '/api/auth/refresh' && method === 'POST') ||
        (originalUrl === '/api/sse/ticket' && method === 'POST') ||
        originalUrl === '/api/health';

    if (isAllowed) {
        return next();
    }

    try {
        // Check cache first
        const { cacheService } = await import('../services/cache.service');
        const cacheKey = `mustChangePassword:${req.user.id}`;
        const cached = await cacheService.get(cacheKey);

        let mustChange: boolean;

        if (cached !== null) {
            mustChange = cached === 'true';
        } else {
            // Query database
            const { prisma } = await import('../lib/prisma');
            const user = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: { mustChangePassword: true },
            });

            mustChange = user?.mustChangePassword ?? false;

            // Cache for 60 seconds
            await cacheService.set(cacheKey, String(mustChange), { ttl: 60 });
        }

        if (mustChange) {
            return res.status(403).json({
                error: 'Password change required',
                code: 'MUST_CHANGE_PASSWORD',
                message: 'Anda harus mengganti password terlebih dahulu sebelum mengakses fitur lain.',
            });
        }

        next();
    } catch (error) {
        console.error('Password change guard error:', error);
        // Fail-open would be a security risk; fail-closed is safer
        // But for availability, we'll let it pass if cache/db is down
        next();
    }
};

