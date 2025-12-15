import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, authMiddleware } from '../middleware/auth.middleware';
import { getNow } from '../services/time.service';
import { logAuth, getRequestContext } from '../services/audit.service';
import { rateLimiter } from '../services/rate-limiter.service';

const router = Router();
const prisma = new PrismaClient();

// Login
router.post('/login', async (req, res) => {
    const context = getRequestContext(req);

    try {
        const { externalId, password } = req.body;

        if (!externalId || !password) {
            return res.status(400).json({ error: 'External ID and password are required' });
        }

        // Get client IP (consider X-Forwarded-For for proxies)
        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

        // Check rate limit BEFORE database queries
        const rateLimitCheck = await rateLimiter.checkRateLimit(externalId, clientIp);
        if (!rateLimitCheck.allowed) {
            console.log(`[RateLimit] Login blocked for ${externalId} from ${clientIp}: ${rateLimitCheck.reason}`);
            return res.status(429).json({
                error: rateLimitCheck.reason || 'Too many attempts',
                remainingTime: rateLimitCheck.remainingTime,
                retryAfter: rateLimitCheck.remainingTime
            });
        }

        const user = await prisma.user.findUnique({
            where: { externalId },
        });

        if (!user || !user.isActive) {
            // Record failed attempt before logging
            await rateLimiter.recordFailedAttempt(externalId, clientIp);

            // Get current attempts for user feedback
            const current = await rateLimiter.getCurrentAttempts(externalId, clientIp);
            const attemptCount = Math.max(current.user, current.ip);
            const remaining = await rateLimiter.getRemainingAttempts(externalId, clientIp);
            const minRemaining = Math.min(remaining.user, remaining.ip);

            // Log failed login attempt
            await logAuth('LOGIN_FAILED', { externalId }, context, {
                success: false,
                errorMessage: !user ? 'User not found' : 'User inactive',
                metadata: { ip: clientIp, attemptCount, remainingAttempts: minRemaining }
            });
            return res.status(401).json({
                error: 'Invalid credentials or user is inactive',
                attemptCount,
                remainingAttempts: minRemaining > 0 ? minRemaining : undefined
            });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            // Record failed attempt before logging
            await rateLimiter.recordFailedAttempt(externalId, clientIp);

            // Get current attempts and remaining for user feedback
            const current = await rateLimiter.getCurrentAttempts(externalId, clientIp);
            const attemptCount = Math.max(current.user, current.ip);
            const remaining = await rateLimiter.getRemainingAttempts(externalId, clientIp);
            const minRemaining = Math.min(remaining.user, remaining.ip);

            // Log failed login attempt
            await logAuth('LOGIN_FAILED', { id: user.id, name: user.name, externalId }, context, {
                success: false,
                errorMessage: 'Invalid password',
                metadata: { ip: clientIp, attemptCount, remainingAttempts: minRemaining }
            });

            return res.status(401).json({
                error: 'Invalid credentials',
                attemptCount,
                remainingAttempts: minRemaining > 0 ? minRemaining : undefined
            });
        }

        const token = jwt.sign(
            { id: user.id, externalId: user.externalId, role: user.role },
            process.env.JWT_SECRET || 'default-secret',
            { expiresIn: '8h' }
        );

        // Reset rate limit on successful login
        await rateLimiter.resetAttempts(externalId, clientIp);

        // Log successful login
        await logAuth('LOGIN', { id: user.id, name: user.name, role: user.role, externalId: user.externalId }, context);

        res.json({
            token,
            user: {
                id: user.id,
                externalId: user.externalId,
                name: user.name,
                email: user.email,
                company: user.company,
                division: user.division,
                department: user.department,
                role: user.role,
                mustChangePassword: user.mustChangePassword,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user profile
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user?.id },
            select: {
                id: true,
                externalId: true,
                name: true,
                email: true,
                company: true,
                division: true,
                department: true,
                role: true,
                noShowCount: true,
                createdAt: true,
            },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check blacklist status
        const blacklist = await prisma.blacklist.findFirst({
            where: {
                userId: user.id,
                isActive: true,
                OR: [
                    { endDate: null },
                    { endDate: { gt: getNow() } },
                ],
            },
        });

        res.json({
            ...user,
            isBlacklisted: !!blacklist,
            blacklistEndDate: blacklist?.endDate,
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Logout
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        if (req.user) {
            const user = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: { id: true, name: true, role: true, externalId: true }
            });
            if (user) {
                await logAuth('LOGOUT', { id: user.id, name: user.name, role: user.role, externalId: user.externalId }, context);
            }
        }
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// Change password
router.post('/change-password', authMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new passwords are required' });
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user?.id },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            await logAuth('PASSWORD_CHANGE', { id: user.id, name: user.name, role: user.role }, context, {
                success: false,
                errorMessage: 'Current password incorrect',
            });
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                mustChangePassword: false,
            },
        });

        // Log successful password change
        await logAuth('PASSWORD_CHANGE', { id: user.id, name: user.name, role: user.role }, context);

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

export default router;
