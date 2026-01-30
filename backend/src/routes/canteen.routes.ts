import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { sseManager } from '../controllers/sse.controller';
import { cacheService } from '../services/cache.service';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createCanteenSchema = z.object({
    name: z.string().min(1, 'Nama kantin harus diisi').max(100),
    location: z.string().max(200).optional().nullable(),
    capacity: z.number().int().positive().optional().nullable(),
    isActive: z.boolean().optional()
});

const updateCanteenSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    location: z.string().max(200).optional().nullable(),
    capacity: z.number().int().positive().optional().nullable(),
    isActive: z.boolean().optional()
});

// Cache keys
const CACHE_KEYS = {
    ACTIVE_CANTEENS: 'canteens:active',
    ALL_CANTEENS: 'canteens:all'
};

// SSE Event types
export const CANTEEN_EVENTS = {
    CREATED: 'canteen:created',
    UPDATED: 'canteen:updated',
    DELETED: 'canteen:deleted'
};

// Invalidate cache helper
const invalidateCanteenCache = async () => {
    await cacheService.delete(CACHE_KEYS.ACTIVE_CANTEENS);
    await cacheService.delete(CACHE_KEYS.ALL_CANTEENS);
};

// GET /api/canteens - List all canteens (authenticated users)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { active } = req.query;
        const showActive = active !== 'false';

        const cacheKey = showActive ? CACHE_KEYS.ACTIVE_CANTEENS : CACHE_KEYS.ALL_CANTEENS;
        const cached = await cacheService.get(cacheKey);

        if (cached) {
            return res.json(cached);
        }

        const canteens = await prisma.canteen.findMany({
            where: showActive ? { isActive: true } : undefined,
            orderBy: { name: 'asc' },
            include: {
                canteenShifts: {
                    include: {
                        shift: {
                            select: { id: true, name: true, startTime: true, endTime: true }
                        }
                    },
                    where: { isActive: true }
                },
                _count: {
                    select: {
                        orders: true,
                        preferredUsers: true
                    }
                }
            }
        });

        const result = { canteens };
        await cacheService.set(cacheKey, result, { ttl: 3600 }); // Cache 1 hour

        res.json(result);
    } catch (error: any) {
        console.error('Get canteens error:', error);
        res.status(500).json({ error: 'Gagal mengambil data kantin' });
    }
});

// GET /api/canteens/:id - Get canteen details (admin only)
router.get('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const canteen = await prisma.canteen.findUnique({
            where: { id },
            include: {
                canteenShifts: {
                    include: {
                        shift: {
                            select: { id: true, name: true, startTime: true, endTime: true }
                        }
                    }
                },
                _count: {
                    select: { orders: true, preferredUsers: true }
                }
            }
        });

        if (!canteen) {
            return res.status(404).json({ error: 'Kantin tidak ditemukan' });
        }

        res.json({ canteen });
    } catch (error: any) {
        console.error('Get canteen error:', error);
        res.status(500).json({ error: 'Gagal mengambil data kantin' });
    }
});

// POST /api/canteens - Create canteen (admin only)
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const validationResult = createCanteenSchema.safeParse(req.body);
        if (!validationResult.success) {
            return res.status(400).json({
                error: 'Data tidak valid',
                details: validationResult.error.errors
            });
        }

        const { name, location, capacity, isActive } = validationResult.data;

        // Check duplicate name (case-insensitive)
        const existing = await prisma.canteen.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } }
        });
        if (existing) {
            return res.status(400).json({ error: 'Nama kantin sudah digunakan' });
        }

        const canteen = await prisma.canteen.create({
            data: {
                name,
                location: location || null,
                capacity: capacity || null,
                isActive: isActive ?? true
            }
        });

        await invalidateCanteenCache();
        sseManager.broadcast(CANTEEN_EVENTS.CREATED, { canteen });

        res.status(201).json({ canteen, message: 'Kantin berhasil dibuat' });
    } catch (error: any) {
        console.error('Create canteen error:', error);
        res.status(500).json({ error: 'Gagal membuat kantin' });
    }
});

// PUT /api/canteens/:id - Update canteen (admin only)
router.put('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const validationResult = updateCanteenSchema.safeParse(req.body);
        if (!validationResult.success) {
            return res.status(400).json({
                error: 'Data tidak valid',
                details: validationResult.error.errors
            });
        }

        const { name, location, capacity, isActive } = validationResult.data;

        // Check canteen exists
        const existing = await prisma.canteen.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Kantin tidak ditemukan' });
        }

        // Check duplicate name if changing (case-insensitive)
        if (name && name !== existing.name) {
            const duplicate = await prisma.canteen.findFirst({
                where: {
                    name: { equals: name, mode: 'insensitive' },
                    id: { not: id }
                }
            });
            if (duplicate) {
                return res.status(400).json({ error: 'Nama kantin sudah digunakan' });
            }
        }

        const canteen = await prisma.canteen.update({
            where: { id },
            data: {
                name: name ?? existing.name,
                location: location === null ? null : (location ?? existing.location),
                capacity: capacity === null ? null : (capacity ?? existing.capacity),
                isActive: isActive ?? existing.isActive
            }
        });

        await invalidateCanteenCache();
        sseManager.broadcast(CANTEEN_EVENTS.UPDATED, { canteen });

        res.json({ canteen, message: 'Kantin berhasil diperbarui' });
    } catch (error: any) {
        console.error('Update canteen error:', error);
        res.status(500).json({ error: 'Gagal memperbarui kantin' });
    }
});

// DELETE /api/canteens/:id - Hard delete canteen (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const canteen = await prisma.canteen.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        orders: {
                            where: { status: 'ORDERED' }
                        }
                    }
                }
            }
        });

        if (!canteen) {
            return res.status(404).json({ error: 'Kantin tidak ditemukan' });
        }

        // Check for active orders
        if ((canteen._count as any).orders > 0) {
            return res.status(400).json({
                error: `Kantin memiliki ${(canteen._count as any).orders} pesanan aktif. Batalkan pesanan terlebih dahulu.`
            });
        }

        // Hard delete: Remove related records, then delete canteen
        await prisma.$transaction(async (tx) => {
            // 1. Remove CanteenShift entries
            await tx.canteenShift.deleteMany({ where: { canteenId: id } });

            // 2. Clear user preferredCanteenId references
            await tx.user.updateMany({
                where: { preferredCanteenId: id },
                data: { preferredCanteenId: null }
            });

            // 3. Update orders to remove canteen reference (keep history)
            await tx.order.updateMany({
                where: { canteenId: id },
                data: { canteenId: null }
            });

            // 4. Finally delete the canteen
            await tx.canteen.delete({ where: { id } });
        });

        await invalidateCanteenCache();
        sseManager.broadcast(CANTEEN_EVENTS.DELETED, { canteenId: id });

        res.json({ message: 'Kantin berhasil dihapus permanen' });
    } catch (error: any) {
        console.error('Delete canteen error:', error);
        res.status(500).json({ error: 'Gagal menghapus kantin' });
    }
});

// POST /api/canteens/:id/shifts - Manage canteen-shift availability (admin only)
router.post('/:id/shifts', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { shiftIds, capacities } = req.body; // shiftIds: string[], capacities?: Record<string, number>

        if (!Array.isArray(shiftIds)) {
            return res.status(400).json({ error: 'shiftIds harus berupa array' });
        }

        const canteen = await prisma.canteen.findUnique({ where: { id } });
        if (!canteen) {
            return res.status(404).json({ error: 'Kantin tidak ditemukan' });
        }

        // Delete existing canteen-shift mappings
        await prisma.canteenShift.deleteMany({ where: { canteenId: id } });

        // Create new mappings
        const canteenShifts = await Promise.all(
            shiftIds.map((shiftId: string) =>
                prisma.canteenShift.create({
                    data: {
                        canteenId: id,
                        shiftId,
                        capacity: capacities?.[shiftId] || null,
                        isActive: true
                    }
                })
            )
        );

        await invalidateCanteenCache();
        sseManager.broadcast(CANTEEN_EVENTS.UPDATED, { canteenId: id, canteenShifts });

        res.json({ canteenShifts, message: 'Shift kantin berhasil diperbarui' });
    } catch (error: any) {
        console.error('Update canteen shifts error:', error);
        res.status(500).json({ error: 'Gagal memperbarui shift kantin' });
    }
});

// GET /api/canteens/for-order - Get canteens available for a specific shift (user)
router.get('/for-order/:shiftId', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { shiftId } = req.params;
        const { date } = req.query;

        // Find canteens that have this shift available
        const canteenShifts = await prisma.canteenShift.findMany({
            where: {
                shiftId,
                isActive: true,
                canteen: { isActive: true }
            },
            include: {
                canteen: {
                    select: {
                        id: true,
                        name: true,
                        location: true,
                        capacity: true
                    }
                }
            }
        });

        // If no specific canteen-shift mappings, return all active canteens
        if (canteenShifts.length === 0) {
            const allCanteens = await prisma.canteen.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    name: true,
                    location: true,
                    capacity: true
                },
                orderBy: { name: 'asc' }
            });
            return res.json({ canteens: allCanteens, hasShiftRestrictions: false });
        }

        // Get order counts per canteen for the date if provided
        let orderCounts: Record<string, number> = {};
        if (date) {
            const dateStart = new Date(date as string);
            dateStart.setHours(0, 0, 0, 0);
            const dateEnd = new Date(date as string);
            dateEnd.setHours(23, 59, 59, 999);

            const counts = await prisma.order.groupBy({
                by: ['canteenId'],
                where: {
                    shiftId,
                    orderDate: { gte: dateStart, lte: dateEnd },
                    status: { not: 'CANCELLED' },
                    canteenId: { not: null }
                },
                _count: { id: true }
            });

            counts.forEach(c => {
                if (c.canteenId) orderCounts[c.canteenId] = c._count.id;
            });
        }

        const canteens = canteenShifts.map(cs => ({
            ...cs.canteen,
            shiftCapacity: cs.capacity,
            currentOrders: orderCounts[cs.canteen.id] || 0,
            isFull: cs.capacity ? (orderCounts[cs.canteen.id] || 0) >= cs.capacity : false
        }));

        res.json({ canteens, hasShiftRestrictions: true });
    } catch (error: any) {
        console.error('Get canteens for order error:', error);
        res.status(500).json({ error: 'Gagal mengambil data kantin' });
    }
});

export default router;
