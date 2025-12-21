import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { AuthRequest, authMiddleware } from '../middleware/auth.middleware';
import { getNow } from '../services/time.service';
import { logAuth, logUserManagement, getRequestContext } from '../services/audit.service';
import { rateLimiter } from '../services/rate-limiter.service';
import { cacheService } from '../services/cache.service';
import { validate } from '../middleware/validate.middleware';
import { loginSchema, changePasswordSchema } from '../utils/validation';

const router = Router();

// Login
router.post('/login', validate(loginSchema), async (req, res) => {
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

        // Check if user exists
        if (!user) {
            await rateLimiter.recordFailedAttempt(externalId, clientIp);
            const current = await rateLimiter.getCurrentAttempts(externalId, clientIp);
            const attemptCount = Math.max(current.user, current.ip);
            const remaining = await rateLimiter.getRemainingAttempts(externalId, clientIp);
            const minRemaining = Math.min(remaining.user, remaining.ip);

            await logAuth('LOGIN_FAILED', { externalId }, context, {
                success: false,
                errorMessage: 'User not found',
                metadata: { ip: clientIp, attemptCount, remainingAttempts: minRemaining }
            });
            return res.status(401).json({
                error: 'User yang Anda input tidak ditemukan',
                code: 'USER_NOT_FOUND',
                attemptCount,
                remainingAttempts: minRemaining > 0 ? minRemaining : undefined
            });
        }

        // Check if user is inactive
        if (!user.isActive) {
            await rateLimiter.recordFailedAttempt(externalId, clientIp);

            await logAuth('LOGIN_FAILED', { externalId, name: user.name }, context, {
                success: false,
                errorMessage: 'User inactive',
                metadata: { ip: clientIp }
            });
            return res.status(403).json({
                error: 'Akun Anda telah dinonaktifkan. Silakan hubungi administrator.',
                code: 'USER_INACTIVE'
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
                error: 'Salah username atau password',
                attemptCount,
                remainingAttempts: minRemaining > 0 ? minRemaining : undefined
            });
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error('CRITICAL: JWT_SECRET environment variable is not set!');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const token = jwt.sign(
            { id: user.id, externalId: user.externalId, role: user.role },
            jwtSecret,
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
                preferredCanteenId: true,
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

// Update current user profile
router.put('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { preferredCanteenId } = req.body;

        // Allowed fields to update
        const updateData: any = {};

        if (preferredCanteenId !== undefined) {
            // Verify canteen exists if not null
            if (preferredCanteenId) {
                const canteen = await prisma.canteen.findUnique({
                    where: { id: preferredCanteenId, isActive: true }
                });
                if (!canteen) {
                    return res.status(400).json({ error: 'Kantin tidak valid atau tidak aktif' });
                }
            }
            updateData.preferredCanteenId = preferredCanteenId;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const user = await prisma.user.update({
            where: { id: req.user?.id },
            data: updateData,
            select: {
                id: true,
                externalId: true,
                name: true,
                email: true,
                company: true,
                division: true,
                department: true,
                role: true,
                preferredCanteenId: true,
                createdAt: true,
            },
        });

        // Log profile update
        const context = getRequestContext(req);
        await logUserManagement('UPDATE', { id: user.id, name: user.name, role: user.role }, user, context, {
            metadata: { updatedFields: Object.keys(updateData), isProfileUpdate: true }
        });

        // Invalidate canteen cache if preferredCanteenId was changed (to update user counts)
        if (updateData.preferredCanteenId !== undefined) {
            await cacheService.delete('canteens:*');
        }

        res.json(user);
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
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
router.post('/change-password', authMiddleware, validate(changePasswordSchema), async (req: AuthRequest, res: Response) => {
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
