import { PrismaClient } from '@prisma/client';

// Prevent multiple instances of Prisma Client in development
declare global {
    // eslint-disable-next-line no-var
    var prisma: PrismaClient | undefined;
}

// Connection pool configuration for 2500+ users
// Pool size = (number of cores * 2) + effective_spindle_count
// For a typical 4-core server: (4 * 2) + 1 = 9, but we set higher for scalability
const poolConfig = {
    // Maximum connections in the pool
    connectionLimit: parseInt(process.env.DB_POOL_SIZE || '50'),
    // Connection timeout in milliseconds
    connectTimeout: 30000,
};

export const prisma = globalThis.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
        db: {
            // DATABASE_URL already contains ?schema=public, so use & for additional params
            url: `${process.env.DATABASE_URL}&connection_limit=${poolConfig.connectionLimit}&connect_timeout=${poolConfig.connectTimeout / 1000}`,
        },
    },
});

if (process.env.NODE_ENV !== 'production') {
    globalThis.prisma = prisma;
}
