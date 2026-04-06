import { prisma } from '../lib/prisma';

export async function cleanupExpiredTokens() {
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const result = await prisma.refreshToken.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: new Date() } },
                    { isRevoked: true, createdAt: { lt: sevenDaysAgo } }
                ]
            }
        });
        
        if (result.count > 0) {
            console.log(`🧹 Cleaned up ${result.count} expired/revoked refresh tokens`);
        }
    } catch (error) {
        console.error('Failed to cleanup expired tokens:', error);
    }
}
