import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from './auth.middleware';
import { getNow } from '../services/time.service';

const prisma = new PrismaClient();

export const blacklistMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        // Check if user has an active blacklist entry
        const blacklistEntry = await prisma.blacklist.findFirst({
            where: {
                userId,
                isActive: true,
                OR: [
                    { endDate: null }, // Permanent or until manual removal
                    { endDate: { gt: getNow() } }, // End date is in the future
                ],
            },
            include: {
                user: {
                    select: { name: true, externalId: true },
                },
            },
        });

        if (blacklistEntry) {
            const endDateMessage = blacklistEntry.endDate
                ? `until ${blacklistEntry.endDate.toLocaleDateString()}`
                : 'indefinitely';

            return res.status(403).json({
                error: 'User is blacklisted',
                message: `You are currently blacklisted ${endDateMessage}. Reason: ${blacklistEntry.reason}`,
                blacklistId: blacklistEntry.id,
                startDate: blacklistEntry.startDate,
                endDate: blacklistEntry.endDate,
                reason: blacklistEntry.reason,
            });
        }

        next();
    } catch (error) {
        console.error('Blacklist middleware error:', error);
        return res.status(500).json({ error: 'Failed to check blacklist status' });
    }
};

// Helper function to check and potentially auto-expire blacklists
export const checkAndExpireBlacklists = async () => {
    try {
        const now = getNow();

        // Deactivate expired blacklist entries
        const result = await prisma.blacklist.updateMany({
            where: {
                isActive: true,
                endDate: { lte: now },
            },
            data: {
                isActive: false,
            },
        });

        if (result.count > 0) {
            console.log(`✅ Expired ${result.count} blacklist entries`);
        }

        return result.count;
    } catch (error) {
        console.error('Error expiring blacklists:', error);
        return 0;
    }
};
