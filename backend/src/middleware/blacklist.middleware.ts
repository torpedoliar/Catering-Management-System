import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { getNow } from '../services/time.service';
import { prisma } from '../lib/prisma';
import { cacheService } from '../services/cache.service';

const BLACKLIST_CACHE_TTL = 60; // seconds — FIX-H3

export const blacklistMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const cacheKey = `blacklist:active:${userId}`;

        // FIX-H3: Check cache first
        const cached = await cacheService.get<{ blacklisted: boolean; entry?: any }>(cacheKey);

        if (cached?.blacklisted) {
            const entry = cached.entry;
            const endDateMessage = entry.endDate
                ? `until ${new Date(entry.endDate).toLocaleDateString()}`
                : 'indefinitely';

            return res.status(403).json({
                error: 'User is blacklisted',
                message: `You are currently blacklisted ${endDateMessage}. Reason: ${entry.reason}`,
                blacklistId: entry.id,
                startDate: entry.startDate,
                endDate: entry.endDate,
                reason: entry.reason,
            });
        }

        if (cached === null) {
            // Cache miss — query DB
            const blacklistEntry = await prisma.blacklist.findFirst({
                where: {
                    userId,
                    isActive: true,
                    OR: [
                        { endDate: null }, // Permanent or until manual removal
                        { endDate: { gt: getNow() } }, // End date is in the future
                    ],
                },
                select: {
                    id: true,
                    startDate: true,
                    endDate: true,
                    reason: true,
                    user: { select: { name: true, externalId: true } },
                },
            });

            if (blacklistEntry) {
                // Cache the blacklisted state
                await cacheService.set(cacheKey, { blacklisted: true, entry: blacklistEntry }, { ttl: BLACKLIST_CACHE_TTL });

                const endDateMessage = blacklistEntry.endDate
                    ? `until ${new Date(blacklistEntry.endDate).toLocaleDateString()}`
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

            // Not blacklisted — cache negative result too
            await cacheService.set(cacheKey, { blacklisted: false }, { ttl: BLACKLIST_CACHE_TTL });
        }

        next();
    } catch (error) {
        console.error('Blacklist middleware error:', error);
        // Fail open — allow request if cache/DB fails
        next();
    }
};

// Helper function to check and potentially auto-expire blacklists
export const checkAndExpireBlacklists = async () => {
    try {
        const now = getNow();

        // Find expired entries first so we can clear their cache
        const expiredEntries = await prisma.blacklist.findMany({
            where: {
                isActive: true,
                endDate: { lte: now },
            },
            select: { userId: true },
        });

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
            // FIX-H3: Clear cache for affected users
            for (const entry of expiredEntries) {
                await cacheService.delete(`blacklist:active:${entry.userId}`);
            }
        }

        return result.count;
    } catch (error) {
        console.error('Error expiring blacklists:', error);
        return 0;
    }
};
