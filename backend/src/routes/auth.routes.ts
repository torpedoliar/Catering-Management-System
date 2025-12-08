import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, authMiddleware } from '../middleware/auth.middleware';
import { getNow } from '../services/time.service';
import { logAuth, getRequestContext } from '../services/audit.service';

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

        const user = await prisma.user.findUnique({
            where: { externalId },
        });

        if (!user || !user.isActive) {
            // Log failed login attempt
            await logAuth('LOGIN_FAILED', { externalId }, context, {
                success: false,
                errorMessage: !user ? 'User not found' : 'User inactive',
            });
            return res.status(401).json({ error: 'Invalid credentials or user is inactive' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            // Log failed login attempt
            await logAuth('LOGIN_FAILED', { id: user.id, name: user.name, externalId }, context, {
                success: false,
                errorMessage: 'Invalid password',
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, externalId: user.externalId, role: user.role },
            process.env.JWT_SECRET || 'default-secret',
            { expiresIn: '8h' }
        );

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
