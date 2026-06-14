import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { sseManager } from '../controllers/sse.controller';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const router = Router();

// Setup multer for image upload
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), 'uploads', 'menus');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * GET /api/menu-items
 * List all menu items
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { vendorId, category, includeInactive } = req.query;

        const where: any = {};
        if (vendorId) where.vendorId = vendorId;
        if (category) where.category = category;
        if (includeInactive !== 'true') where.isActive = true;

        const menuItems = await prisma.menuItem.findMany({
            where,
            orderBy: [{ vendor: { name: 'asc' } }, { name: 'asc' }],
            include: {
                vendor: {
                    select: { id: true, name: true, logoUrl: true }
                }
            }
        });

        res.json(menuItems);
    } catch (error) {
        console.error('List menu items error:', error);
        res.status(500).json({ error: 'Failed to list menu items' });
    }
});

/**
 * GET /api/menu-items/categories
 * Get unique categories
 */
router.get('/categories', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const categories = await prisma.menuItem.findMany({
            where: { isActive: true, category: { not: null } },
            select: { category: true },
            distinct: ['category']
        });

        res.json(categories.map(c => c.category).filter(Boolean));
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Failed to get categories' });
    }
});

/**
 * GET /api/menu-items/:id
 * Get menu item detail
 */
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const menuItem = await prisma.menuItem.findUnique({
            where: { id: req.params.id },
            include: {
                vendor: {
                    select: { id: true, name: true, logoUrl: true }
                }
            }
        });

        if (!menuItem) {
            return res.status(404).json({ error: 'Menu item not found' });
        }

        res.json(menuItem);
    } catch (error) {
        console.error('Get menu item error:', error);
        res.status(500).json({ error: 'Failed to get menu item' });
    }
});

/**
 * POST /api/menu-items
 * Create a new menu item
 *
 * F-4 (Wave 4): ADMIN can create items for any vendor. VENDOR can
 * only create items for their own vendor (vendorId in body must
 * match req.user.vendorId, or be omitted and we'll fill it from the
 * user's own vendorId). Without this, a VENDOR could create menu
 * items for any other vendor.
 */
router.post('/', authMiddleware, upload.single('image'), async (req: AuthRequest, res: Response) => {
    try {
        let { name, description, category, vendorId } = req.body;

        const isAdmin = req.user?.role === 'ADMIN';
        const isVendor = req.user?.role === 'VENDOR';

        if (!isAdmin && !isVendor) {
            return res.status(403).json({ error: 'Admin or Vendor access required' });
        }

        if (isVendor) {
            // Force vendorId to the caller's own; reject any attempt to
            // create for another vendor.
            if (!req.user?.vendorId) {
                return res.status(403).json({ error: 'Vendor account is not bound to a vendor' });
            }
            if (vendorId && vendorId !== req.user.vendorId) {
                return res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot create items for another vendor' });
            }
            vendorId = req.user.vendorId;
        }

        if (!name || !vendorId) {
            return res.status(400).json({ error: 'Name and vendorId are required' });
        }

        // Verify vendor exists
        const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
        if (!vendor) {
            return res.status(400).json({ error: 'Vendor not found' });
        }

        // Process image if uploaded
        let imageUrl = null;
        if (req.file) {
            const filename = `menu-${Date.now()}.webp`;
            const filepath = path.join(uploadDir, filename);

            await sharp(req.file.buffer)
                .resize(400, 300, { fit: 'cover' })
                .webp({ quality: 80 })
                .toFile(filepath);

            imageUrl = `/uploads/menus/${filename}`;
        }

        const menuItem = await prisma.menuItem.create({
            data: {
                name,
                description: description || null,
                category: category || null,
                vendorId,
                imageUrl
            },
            include: {
                vendor: {
                    select: { id: true, name: true, logoUrl: true }
                }
            }
        });

        // Broadcast SSE event
        sseManager.broadcast('menu:created', { menuItem });

        res.status(201).json(menuItem);
    } catch (error) {
        console.error('Create menu item error:', error);
        res.status(500).json({ error: 'Failed to create menu item' });
    }
});

/**
 * PUT /api/menu-items/:id
 * Update a menu item
 *
 * F-4 (Wave 4): VENDOR can only update items owned by their vendor.
 * ADMIN can update any item. The vendorId field in the body is
 * enforced: VENDOR cannot reassign to a different vendor.
 */
router.put('/:id', authMiddleware, upload.single('image'), async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { name, description, category, vendorId, isActive } = req.body;

        const isAdmin = req.user?.role === 'ADMIN';
        const isVendor = req.user?.role === 'VENDOR';

        if (!isAdmin && !isVendor) {
            return res.status(403).json({ error: 'Admin or Vendor access required' });
        }

        const existing = await prisma.menuItem.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Menu item not found' });
        }

        // F-4: ownership check for VENDOR role
        if (isVendor) {
            if (!req.user?.vendorId) {
                return res.status(403).json({ error: 'Vendor account is not bound to a vendor' });
            }
            if (existing.vendorId !== req.user.vendorId) {
                return res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot modify another vendor\'s menu item' });
            }
            // VENDOR cannot reassign ownership
            if (vendorId && vendorId !== req.user.vendorId) {
                return res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot reassign vendorId' });
            }
        }

        // Verify vendor if changing (admin only path)
        if (isAdmin && vendorId && vendorId !== existing.vendorId) {
            const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
            if (!vendor) {
                return res.status(400).json({ error: 'Vendor not found' });
            }
        }

        // Process image if uploaded
        let imageUrl = existing.imageUrl;
        if (req.file) {
            // Delete old image
            if (existing.imageUrl) {
                const oldPath = path.join(process.cwd(), existing.imageUrl);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }

            const filename = `menu-${Date.now()}.webp`;
            const filepath = path.join(uploadDir, filename);

            await sharp(req.file.buffer)
                .resize(400, 300, { fit: 'cover' })
                .webp({ quality: 80 })
                .toFile(filepath);

            imageUrl = `/uploads/menus/${filename}`;
        }

        const menuItem = await prisma.menuItem.update({
            where: { id },
            data: {
                name: name || existing.name,
                description: description !== undefined ? description : existing.description,
                category: category !== undefined ? category : existing.category,
                vendorId: vendorId || existing.vendorId,
                imageUrl,
                isActive: isActive !== undefined ? isActive === 'true' || isActive === true : existing.isActive
            },
            include: {
                vendor: {
                    select: { id: true, name: true, logoUrl: true }
                }
            }
        });

        // Broadcast SSE event
        sseManager.broadcast('menu:updated', { menuItem });

        res.json(menuItem);
    } catch (error) {
        console.error('Update menu item error:', error);
        res.status(500).json({ error: 'Failed to update menu item' });
    }
});

/**
 * DELETE /api/menu-items/:id
 * Delete a menu item
 *
 * F-4 (Wave 4): same ownership rule as PUT. VENDOR can only delete
 * their own items. ADMIN can delete any.
 */
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const isAdmin = req.user?.role === 'ADMIN';
        const isVendor = req.user?.role === 'VENDOR';

        if (!isAdmin && !isVendor) {
            return res.status(403).json({ error: 'Admin or Vendor access required' });
        }

        const existing = await prisma.menuItem.findUnique({
            where: { id },
            include: { _count: { select: { weeklyMenus: true } } }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Menu item not found' });
        }

        // F-4: VENDOR ownership check
        if (isVendor) {
            if (!req.user?.vendorId) {
                return res.status(403).json({ error: 'Vendor account is not bound to a vendor' });
            }
            if (existing.vendorId !== req.user.vendorId) {
                return res.status(403).json({ error: 'FORBIDDEN', message: 'Cannot delete another vendor\'s menu item' });
            }
        }

        // Cascade delete: Remove from all weekly menus first
        let weeklyMenusDeleted = 0;
        if (existing._count.weeklyMenus > 0) {
            const deleteResult = await prisma.weeklyMenu.deleteMany({
                where: { menuItemId: id }
            });
            weeklyMenusDeleted = deleteResult.count;
            console.log(`Cascade deleted ${weeklyMenusDeleted} weekly menu entries for menu item: ${existing.name}`);
        }

        // Delete image file
        if (existing.imageUrl) {
            const imagePath = path.join(process.cwd(), existing.imageUrl);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        await prisma.menuItem.delete({ where: { id } });

        // Broadcast SSE events
        sseManager.broadcast('menu:deleted', {
            menuItemId: id,
            menuItemName: existing.name,
            weeklyMenusDeleted
        });

        if (weeklyMenusDeleted > 0) {
            sseManager.broadcast('weekly-menu:updated', {
                action: 'cascade-delete',
                menuItemId: id,
                deletedCount: weeklyMenusDeleted
            });
        }

        res.json({
            message: 'Menu item deleted successfully',
            weeklyMenusDeleted
        });
    } catch (error) {
        console.error('Delete menu item error:', error);
        res.status(500).json({ error: 'Failed to delete menu item' });
    }
});

export default router;
