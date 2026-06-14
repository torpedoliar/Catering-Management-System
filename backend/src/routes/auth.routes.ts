import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest, authMiddleware } from '../middleware/auth.middleware';
import { getNow } from '../services/time.service';
import { logAuth, logUserManagement, getRequestContext } from '../services/audit.service';
import { rateLimiter } from '../services/rate-limiter.service';
import { cacheService, getCachedSettings } from '../services/cache.service';
import { validate } from '../middleware/validate.middleware';
import { loginSchema, changePasswordSchema } from '../utils/validation';
import { ENABLE_TOKEN_ROTATION } from '../utils/env';

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

        // Check if user is blacklisted (block login entirely)
        const activeBlacklist = await prisma.blacklist.findFirst({
            where: {
                userId: user.id,
                isActive: true,
                OR: [
                    { endDate: null },
                    { endDate: { gt: getNow() } },
                ],
            },
        });

        if (activeBlacklist) {
            await logAuth('LOGIN_FAILED', { id: user.id, name: user.name, externalId }, context, {
                success: false,
                errorMessage: 'User blacklisted',
                metadata: {
                    ip: clientIp,
                    blacklistId: activeBlacklist.id,
                    blacklistReason: activeBlacklist.reason,
                    blacklistEndDate: activeBlacklist.endDate?.toISOString() || 'Permanent',
                },
            });
            const endDateMsg = activeBlacklist.endDate
                ? ` hingga ${activeBlacklist.endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
                : ' secara permanen';
            return res.status(403).json({
                error: `Akun Anda sedang diblokir${endDateMsg}. Alasan: ${activeBlacklist.reason}`,
                code: 'USER_BLACKLISTED',
            });
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error('CRITICAL: JWT_SECRET environment variable is not set!');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Generate Access Token (R-003: shortened to 15 minutes to reduce localStorage exposure window)
        const token = jwt.sign(
            { id: user.id, externalId: user.externalId, role: user.role, vendorId: user.vendorId ?? undefined },
            jwtSecret,
            { expiresIn: '15m' }
        );

        // Generate Refresh Token (30 days)
        const refreshSecret = process.env.JWT_REFRESH_SECRET;
        if (!refreshSecret) {
            console.error('CRITICAL: JWT_REFRESH_SECRET environment variable is not set!');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const refreshTokenValue = jwt.sign(
            { id: user.id, type: 'refresh' },
            refreshSecret,
            { expiresIn: '30d' }
        );

        // Hash refresh token for storage
        const hashedRefreshToken = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');

        // Detect device platform from user-agent
        const userAgent = req.headers['user-agent'] || '';
        let deviceInfo = 'Web';
        if (userAgent.includes('HalloFood-Android')) deviceInfo = 'Android';
        else if (userAgent.includes('HalloFood-iOS')) deviceInfo = 'iOS';

        // F-3: each new login starts a fresh refresh-token family. The same
        // family is inherited by all rotations of THIS login session. A stolen
        // (revoked) token presented to /refresh triggers family-revoke, which
        // evicts every device that authenticated in this session.
        const tokenFamilyId = crypto.randomUUID();

        // Save refresh token to DB
        await prisma.refreshToken.create({
            data: {
                token: hashedRefreshToken,
                userId: user.id,
                deviceInfo,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                tokenFamilyId,
            }
        });

        // Reset rate limit on successful login
        await rateLimiter.resetAttempts(externalId, clientIp);

        // Log successful login
        await logAuth('LOGIN', { id: user.id, name: user.name, role: user.role, externalId: user.externalId }, context);

        // R-005: Set refresh token as HttpOnly Secure cookie for web clients
        const isProduction = process.env.NODE_ENV === 'production';
        res.cookie('refreshToken', refreshTokenValue, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' : 'lax',
            path: '/api/auth',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });

        // R-003: Only include refreshToken in JSON body for native mobile clients
        // Web clients use the HttpOnly cookie above — never expose refreshToken to JavaScript
        const isNativeClient = deviceInfo === 'Android' || deviceInfo === 'iOS';

        const responsePayload: Record<string, any> = {
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
        };

        if (isNativeClient) {
            responsePayload.refreshToken = refreshTokenValue;
        }

        res.json(responsePayload);
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
            // SECURITY: Only ADMIN can change preferredCanteenId
            if (req.user?.role !== 'ADMIN') {
                return res.status(403).json({ error: 'Hanya Admin yang dapat mengubah lokasi kantin' });
            }

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

// Refresh Access Token
router.post('/refresh', async (req, res) => {
    const context = getRequestContext(req);
    try {
        // R-005: Read refresh token from HttpOnly cookie first, fallback to body (for Capacitor native)
        const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        const refreshSecret = process.env.JWT_REFRESH_SECRET;
        const jwtSecret = process.env.JWT_SECRET;
        if (!refreshSecret || !jwtSecret) {
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // 1. Verifikasi JWT signature & expiry
        let decoded: { id: string; type: string };
        try {
            decoded = jwt.verify(refreshToken, refreshSecret) as any;
        } catch {
            return res.status(401).json({ error: 'Invalid or expired refresh token' });
        }

        if (decoded.type !== 'refresh') {
            return res.status(401).json({ error: 'Invalid token type' });
        }

        // 2. Cek apakah token ada di DB dan belum dicabut
        const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');

        const storedToken = await prisma.refreshToken.findUnique({
            where: { token: hashedToken }
        });

        if (!storedToken || storedToken.isRevoked) {
            // F-3 family-revoke: a revoked token presented to /refresh means
            // somebody (re)used a token we already retired. The legit user
            // would have moved on to the rotated successor. Evict every
            // sibling in this token family to lock the attacker out.
            //
            // Edge case: pre-migration tokens have tokenFamilyId=null. We
            // can't do family-revoke on those, so fall back to revoking
            // ALL active tokens for the user — same end-state (force
            // re-login) but broader blast radius. Acceptable: only
            // triggered for tokens issued before Wave 1 migration.
            if (storedToken?.isRevoked) {
                try {
                    if (storedToken.tokenFamilyId) {
                        await prisma.refreshToken.updateMany({
                            where: {
                                tokenFamilyId: storedToken.tokenFamilyId,
                                isRevoked: false,
                            },
                            data: {
                                isRevoked: true,
                                revokedReason: 'STOLEN_TOKEN_DETECTED',
                            },
                        });
                        await logAuth('TOKEN_FAMILY_REVOKED', { id: storedToken.userId }, context, {
                            success: true,
                            metadata: {
                                tokenFamilyId: storedToken.tokenFamilyId,
                                source: 'reused_revoked',
                            },
                        });
                    } else {
                        // No family → revoke everything for this user. Catches
                        // legacy pre-rotation tokens that slipped through.
                        await prisma.refreshToken.updateMany({
                            where: { userId: storedToken.userId, isRevoked: false },
                            data: { isRevoked: true, revokedReason: 'STOLEN_TOKEN_DETECTED_NO_FAMILY' },
                        });
                        await logAuth('TOKEN_FAMILY_REVOKED', { id: storedToken.userId }, context, {
                            success: true,
                            metadata: {
                                source: 'reused_revoked_no_family',
                                fallbackScope: 'user',
                            },
                        });
                    }
                } catch (err) {
                    console.error('[F-3] Family revoke failed:', err);
                }
            }
            return res.status(401).json({ error: 'Token has been revoked' });
        }

        // 3. Cek apakah user masih aktif
        const user = await prisma.user.findUnique({
            where: { id: decoded.id }
        });

        if (!user || !user.isActive) {
            // Revoke token jika user sudah tidak aktif
            await prisma.refreshToken.update({
                where: { id: storedToken.id },
                data: { isRevoked: true }
            });
            return res.status(401).json({ error: 'User account is inactive' });
        }

        // Check if user is blacklisted (block refresh for blacklisted users)
        const refreshBlacklist = await prisma.blacklist.findFirst({
            where: {
                userId: user.id,
                isActive: true,
                OR: [
                    { endDate: null },
                    { endDate: { gt: getNow() } },
                ],
            },
        });

        if (refreshBlacklist) {
            // Revoke all refresh tokens for this blacklisted user
            await prisma.refreshToken.updateMany({
                where: { userId: user.id },
                data: { isRevoked: true },
            });
            return res.status(401).json({ error: 'User account is blacklisted' });
        }

        // 4. Terbitkan Access Token baru (R-003: 15 minutes to match login)
        const newAccessToken = jwt.sign(
            { id: user.id, externalId: user.externalId, role: user.role, vendorId: user.vendorId ?? undefined },
            jwtSecret,
            { expiresIn: '15m' }
        );

        // F-3: refresh-token rotation. Two sources of truth — env var for
        // fast kill-switch, settings.enableTokenRotation for per-deployment
        // opt-in. Either being true enables rotation. The "disabled" path
        // preserves the original long-lived single-use-per-30d behavior so
        // deployments that have not opted in are not affected.
        const settings = await getCachedSettings();
        const settingsFlag = settings?.enableTokenRotation === true;
        const rotationEnabled = ENABLE_TOKEN_ROTATION || settingsFlag;

        if (rotationEnabled) {
            // Mark the old token as rotated (NOT yet family-revoked) and
            // issue a brand-new refresh token in the same family. The new
            // token's record is created first so we can set replacedById
            // on the old record (self-FK requires the row to exist).
            const newRefreshValue = jwt.sign(
                { id: user.id, type: 'refresh' },
                refreshSecret,
                { expiresIn: '30d' }
            );
            const newHash = crypto.createHash('sha256').update(newRefreshValue).digest('hex');

            // First-time rotation: legacy token has no family yet. Adopt it
            // into a fresh family so future reuse detection works for any
            // token this user has ever held.
            const familyId = storedToken.tokenFamilyId ?? crypto.randomUUID();

            const newRecord = await prisma.refreshToken.create({
                data: {
                    token: newHash,
                    userId: user.id,
                    deviceInfo: storedToken.deviceInfo,
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    tokenFamilyId: familyId,
                },
            });

            await prisma.refreshToken.update({
                where: { id: storedToken.id },
                data: {
                    isRevoked: true,
                    revokedReason: 'ROTATED',
                    replacedById: newRecord.id,
                    // Backfill family on the old row so the chain is linked.
                    ...(storedToken.tokenFamilyId ? {} : { tokenFamilyId: familyId }),
                },
            });

            await logAuth('TOKEN_REFRESHED', { id: user.id, name: user.name, role: user.role, externalId: user.externalId }, context, {
                success: true,
                metadata: { tokenFamilyId: familyId, prevTokenId: storedToken.id, newTokenId: newRecord.id },
            });

            // Set rotated cookie (web) and include in body (native)
            const isProduction = process.env.NODE_ENV === 'production';
            res.cookie('refreshToken', newRefreshValue, {
                httpOnly: true,
                secure: isProduction,
                sameSite: isProduction ? 'strict' : 'lax',
                path: '/api/auth',
                maxAge: 30 * 24 * 60 * 60 * 1000,
            });

            const isNativeClient = storedToken.deviceInfo === 'Android' || storedToken.deviceInfo === 'iOS';
            const responsePayload: Record<string, any> = { token: newAccessToken };
            if (isNativeClient) {
                responsePayload.refreshToken = newRefreshValue;
            }
            return res.json(responsePayload);
        }

        // Legacy non-rotation path (default for unflagged deployments).
        res.json({ token: newAccessToken });
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});

// Logout
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);

    try {
        if (req.user) {
            // Cabut SEMUA refresh token milik user ini
            await prisma.refreshToken.updateMany({
                where: { userId: req.user.id, isRevoked: false },
                data: { isRevoked: true }
            });

            const user = await prisma.user.findUnique({
                where: { id: req.user.id },
                select: { id: true, name: true, role: true, externalId: true }
            });
            if (user) {
                await logAuth('LOGOUT', { id: user.id, name: user.name, role: user.role, externalId: user.externalId }, context);
            }
        }

        // R-005: Clear refresh token cookie
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            path: '/api/auth',
        });

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

        // R-001: Invalidate mustChangePassword cache immediately
        await cacheService.delete(`mustChangePassword:${user.id}`);

        // R-005: Revoke all refresh tokens after password change (force re-login on all devices)
        await prisma.refreshToken.updateMany({
            where: { userId: user.id, isRevoked: false },
            data: { isRevoked: true },
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
