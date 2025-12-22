import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const router = Router();

// Setup multer for logo upload
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
const uploadDir = path.join(process.cwd(), 'uploads', 'vendors');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * GET /api/vendors
 * List all vendors
 */
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { includeInactive } = req.query;

        const vendors = await prisma.vendor.findMany({
            where: includeInactive === 'true' ? {} : { isActive: true },
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: { menuItems: true }
                }
            }
        });

        res.json(vendors);
    } catch (error) {
        console.error('List vendors error:', error);
        res.status(500).json({ error: 'Failed to list vendors' });
    }
});

/**
 * GET /api/vendors/:id
 * Get vendor detail
 */
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const vendor = await prisma.vendor.findUnique({
            where: { id: req.params.id },
            include: {
                menuItems: {
                    where: { isActive: true },
                    orderBy: { name: 'asc' }
                },
                _count: {
                    select: { menuItems: true }
                }
            }
        });

        if (!vendor) {
            return res.status(404).json({ error: 'Vendor not found' });
        }

        res.json(vendor);
    } catch (error) {
        console.error('Get vendor error:', error);
        res.status(500).json({ error: 'Failed to get vendor' });
    }
});

/**
 * POST /api/vendors
 * Create a new vendor (Admin only)
 */
router.post('/', authMiddleware, adminMiddleware, upload.single('logo'), async (req: AuthRequest, res: Response) => {
    try {
        const { name, description, contact } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Check for duplicate name
        const existing = await prisma.vendor.findUnique({ where: { name } });
        if (existing) {
            return res.status(400).json({ error: 'Vendor with this name already exists' });
        }

        // Process logo if uploaded
        let logoUrl = null;
        if (req.file) {
            const filename = `vendor-${Date.now()}.webp`;
            const filepath = path.join(uploadDir, filename);

            await sharp(req.file.buffer)
                .resize(200, 200, { fit: 'cover' })
                .webp({ quality: 80 })
                .toFile(filepath);

            logoUrl = `/uploads/vendors/${filename}`;
        }

        const vendor = await prisma.vendor.create({
            data: {
                name,
                description: description || null,
                contact: contact || null,
                logoUrl
            }
        });

        res.status(201).json(vendor);
    } catch (error) {
        console.error('Create vendor error:', error);
        res.status(500).json({ error: 'Failed to create vendor' });
    }
});

/**
 * PUT /api/vendors/:id
 * Update a vendor (Admin only)
 */
router.put('/:id', authMiddleware, adminMiddleware, upload.single('logo'), async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { name, description, contact, isActive } = req.body;

        const existing = await prisma.vendor.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Vendor not found' });
        }

        // Check for duplicate name
        if (name && name !== existing.name) {
            const duplicate = await prisma.vendor.findUnique({ where: { name } });
            if (duplicate) {
                return res.status(400).json({ error: 'Vendor with this name already exists' });
            }
        }

        // Process logo if uploaded
        let logoUrl = existing.logoUrl;
        if (req.file) {
            // Delete old logo
            if (existing.logoUrl) {
                const oldPath = path.join(process.cwd(), existing.logoUrl);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }

            const filename = `vendor-${Date.now()}.webp`;
            const filepath = path.join(uploadDir, filename);

            await sharp(req.file.buffer)
                .resize(200, 200, { fit: 'cover' })
                .webp({ quality: 80 })
                .toFile(filepath);

            logoUrl = `/uploads/vendors/${filename}`;
        }

        const vendor = await prisma.vendor.update({
            where: { id },
            data: {
                name: name || existing.name,
                description: description !== undefined ? description : existing.description,
                contact: contact !== undefined ? contact : existing.contact,
                logoUrl,
                isActive: isActive !== undefined ? isActive === 'true' || isActive === true : existing.isActive
            }
        });

        res.json(vendor);
    } catch (error) {
        console.error('Update vendor error:', error);
        res.status(500).json({ error: 'Failed to update vendor' });
    }
});

/**
 * DELETE /api/vendors/:id
 * Delete a vendor (Admin only)
 */
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const existing = await prisma.vendor.findUnique({
            where: { id },
            include: { _count: { select: { menuItems: true } } }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Vendor not found' });
        }

        // Check if vendor has menu items
        if (existing._count.menuItems > 0) {
            return res.status(400).json({
                error: `Cannot delete vendor with ${existing._count.menuItems} menu items. Delete menu items first or deactivate the vendor.`
            });
        }

        // Delete logo file
        if (existing.logoUrl) {
            const logoPath = path.join(process.cwd(), existing.logoUrl);
            if (fs.existsSync(logoPath)) {
                fs.unlinkSync(logoPath);
            }
        }

        await prisma.vendor.delete({ where: { id } });

        res.json({ message: 'Vendor deleted successfully' });
    } catch (error) {
        console.error('Delete vendor error:', error);
        res.status(500).json({ error: 'Failed to delete vendor' });
    }
});

export default router;
