import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { ErrorMessages } from '../utils/errorMessages';
import { logUserManagement, logDataOperation, getRequestContext } from '../services/audit.service';
import { apiRateLimitMiddleware } from '../services/rate-limiter.service';
import { validate } from '../middleware/validate.middleware';
import { createUserSchema, updateUserSchema } from '../utils/validation';
import { UserWhereFilter, ImportUserData, ImportError } from '../types';

const router = Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads/users');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Get all users (Admin only)
router.get('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { search, company, division, department, page = '1', limit = '50', status } = req.query;

        const where: UserWhereFilter = {};

        // Filter by status: 'active', 'inactive', or 'all' (default: 'all' - show everyone)
        if (status === 'inactive') {
            where.isActive = false;
        } else if (status === 'active') {
            where.isActive = true;
        }
        // When status is 'all' or not specified, don't filter by isActive (show all users)

        if (search) {
            where.OR = [
                { name: { contains: search as string, mode: 'insensitive' } },
                { externalId: { contains: search as string, mode: 'insensitive' } },
                { nik: { contains: search as string, mode: 'insensitive' } },
                { email: { contains: search as string, mode: 'insensitive' } },
                { company: { contains: search as string, mode: 'insensitive' } },
                { division: { contains: search as string, mode: 'insensitive' } },
                { department: { contains: search as string, mode: 'insensitive' } },
            ];
        }
        if (company) where.company = { contains: company as string, mode: 'insensitive' };
        if (division) where.division = { contains: division as string, mode: 'insensitive' };
        if (department) where.department = { contains: department as string, mode: 'insensitive' };

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    externalId: true,
                    nik: true,
                    name: true,
                    email: true,
                    company: true,
                    division: true,
                    department: true,
                    departmentId: true,
                    role: true,
                    noShowCount: true,
                    isActive: true,
                    createdAt: true,
                    photo: true,
                    preferredCanteenId: true,
                    preferredCanteen: {
                        select: { id: true, name: true, location: true }
                    },
                    blacklists: {
                        where: { isActive: true },
                        select: { id: true, endDate: true },
                    },
                },
                orderBy: { name: 'asc' },
                skip,
                take: parseInt(limit as string),
            }),
            prisma.user.count({ where }),
        ]);

        res.json({
            users: users.map(u => ({
                ...u,
                isBlacklisted: u.blacklists.length > 0,
                blacklistEndDate: u.blacklists[0]?.endDate,
            })),
            pagination: {
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                total,
                totalPages: Math.ceil(total / parseInt(limit as string)),
            },
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Get single user
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            include: {
                orders: {
                    orderBy: { orderDate: 'desc' },
                    take: 10,
                    include: { shift: true },
                },
                blacklists: {
                    where: { isActive: true },
                },
            },
        });

        if (!user) {
            return res.status(404).json({ error: ErrorMessages.USER_NOT_FOUND });
        }

        res.json(user);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Create user (Admin only)
router.post('/', authMiddleware, adminMiddleware, upload.single('photo'), validate(createUserSchema), async (req: AuthRequest, res: Response) => {
    try {
        const { externalId, nik, name, email, password, company, division, department, departmentId, role, vendorId } = req.body;

        if (!externalId || !name) {
            return res.status(400).json({ error: ErrorMessages.MISSING_REQUIRED_FIELDS });
        }

        // Must provide either departmentId OR legacy fields (except for VENDOR role)
        if (role !== 'VENDOR' && !departmentId && (!company || !division || !department)) {
            return res.status(400).json({ error: 'Departemen harus dipilih' });
        }

        // If departmentId is provided, get the department details to auto-populate legacy fields
        let companyName = company || '';
        let divisionName = division || '';
        let departmentName = department || '';

        if (departmentId) {
            const dept = await prisma.department.findUnique({
                where: { id: departmentId },
                include: {
                    division: {
                        include: { company: true }
                    }
                }
            });

            if (dept) {
                companyName = dept.division.company.name;
                divisionName = dept.division.name;
                departmentName = dept.name;
            }
        }

        let photoUrl = undefined;
        if (req.file) {
            const filename = `user-${externalId}-${Date.now()}.webp`;
            const filepath = path.join(uploadDir, filename);

            await sharp(req.file.buffer)
                .resize(300, 300, { fit: 'cover' })
                .webp({ quality: 80 })
                .toFile(filepath);

            photoUrl = `/uploads/users/${filename}`;
        }

        const hashedPassword = await bcrypt.hash(password || 'default123', 10);

        const user = await prisma.user.create({
            data: {
                externalId,
                nik: nik || null,
                name,
                email,
                password: hashedPassword,
                company: companyName,
                division: divisionName,
                department: departmentName,
                departmentId: departmentId || null,
                role: role || 'USER',
                photo: photoUrl,
                vendorId: role === 'VENDOR' ? vendorId || null : null,
            },
        });

        // Log audit
        await logUserManagement('CREATE', req.user || null, user, getRequestContext(req));

        res.status(201).json(user);
    } catch (error: any) {
        console.error('Create user error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: ErrorMessages.USER_ALREADY_EXISTS });
        }
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Update user (Admin only) - Modified to handle file upload
router.put('/:id', authMiddleware, adminMiddleware, upload.single('photo'), async (req: AuthRequest, res: Response) => {
    try {
        const { name, email, company, division, department, departmentId, role, isActive, preferredCanteenId, vendorId } = req.body;

        let photoUrl = undefined;
        if (req.file) {
            const filename = `user-${req.params.id}-${Date.now()}.webp`;
            const filepath = path.join(uploadDir, filename);

            await sharp(req.file.buffer)
                .resize(300, 300, { fit: 'cover' })
                .webp({ quality: 80 })
                .toFile(filepath);

            photoUrl = `/uploads/users/${filename}`;
        }

        // If departmentId is provided, get the department details to auto-populate legacy fields
        let updateData: any = {
            ...(name && { name }),
            ...(email !== undefined && { email }),
            ...(role && { role }),
            ...(isActive !== undefined && { isActive }),
            ...(photoUrl && { photo: photoUrl }),
            ...(preferredCanteenId !== undefined && { preferredCanteenId: preferredCanteenId || null }),
            ...(vendorId !== undefined && { vendorId: role === 'VENDOR' ? vendorId || null : null }),
        };

        if (departmentId !== undefined) {
            if (departmentId) {
                const dept = await prisma.department.findUnique({
                    where: { id: departmentId },
                    include: {
                        division: {
                            include: { company: true }
                        }
                    }
                });

                if (dept) {
                    updateData.departmentId = departmentId;
                    updateData.company = dept.division.company.name;
                    updateData.division = dept.division.name;
                    updateData.department = dept.name;
                }
            } else {
                // departmentId is null - clear the reference
                updateData.departmentId = null;
                // Keep manual company/division/department if provided
                if (company) updateData.company = company;
                if (division) updateData.division = division;
                if (department) updateData.department = department;
            }
        } else {
            // departmentId not in request, use manual values if provided
            if (company) updateData.company = company;
            if (division) updateData.division = division;
            if (department) updateData.department = department;
        }

        // Get old user data for audit
        const oldUser = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, externalId: true, name: true, email: true, company: true, division: true, department: true, role: true, isActive: true, photo: true }
        });

        // Delete old photo if new one uploaded
        if (photoUrl && oldUser?.photo) {
            try {
                const oldPhotoPath = path.join(__dirname, '../../', oldUser.photo);
                if (fs.existsSync(oldPhotoPath)) {
                    fs.unlinkSync(oldPhotoPath);
                }
            } catch (err) {
                console.error('Failed to delete old photo:', err);
            }
        }

        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: updateData,
        });

        // Log audit
        await logUserManagement('UPDATE', req.user || null, user, getRequestContext(req), { oldValue: oldUser });

        res.json(user);
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

import { OrderService } from '../services/order.service';

// Delete user (Admin only) - HARD DELETE with password confirmation
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { password } = req.body;

        // Require password confirmation
        if (!password) {
            return res.status(400).json({ error: 'Password konfirmasi diperlukan' });
        }

        // Verify admin password
        const admin = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: { password: true }
        });

        if (!admin) {
            return res.status(401).json({ error: 'Admin tidak ditemukan' });
        }

        const isPasswordValid = await bcrypt.compare(password, admin.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Password salah' });
        }

        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
        });

        if (!user) {
            return res.status(404).json({ error: ErrorMessages.USER_NOT_FOUND });
        }

        // Prevent deleting yourself
        if (user.id === req.user!.id) {
            return res.status(400).json({ error: 'Tidak dapat menghapus akun sendiri' });
        }

        // Auto-cancel all pending orders for this user BEFORE deleting
        await OrderService.cancelUserOrders(user.id, 'User dihapus permanen dari sistem oleh Admin');

        // Hard delete: Remove related records first, then delete user
        await prisma.$transaction(async (tx) => {
            // Delete related blacklists
            await tx.blacklist.deleteMany({ where: { userId: user.id } });

            // Delete related messages
            await tx.message.deleteMany({ where: { userId: user.id } });

            // Delete orders (already cancelled above)
            await tx.order.deleteMany({ where: { userId: user.id } });

            // Finally delete the user
            await tx.user.delete({ where: { id: user.id } });
        });

        // Log audit
        await logUserManagement('DELETE', req.user || null, user, getRequestContext(req), {
            metadata: { deleteType: 'HARD_DELETE' }
        });

        res.json({ message: 'Pengguna berhasil dihapus permanen' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: ErrorMessages.SERVER_ERROR });
    }
});

// Import users from Excel (Admin only)
router.post('/import', authMiddleware, adminMiddleware, apiRateLimitMiddleware('upload'), upload.single('file'), async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer as any);

        const worksheet = workbook.getWorksheet(1);
        if (!worksheet) {
            return res.status(400).json({ error: 'No worksheet found in file' });
        }

        const users: ImportUserData[] = [];
        const errors: ImportError[] = [];
        let rowNumber = 0;

        worksheet.eachRow((row, index) => {
            if (index === 1) return; // Skip header row
            rowNumber++;

            const externalId = row.getCell(1).text?.toString().trim();
            const nik = row.getCell(2).text?.toString().trim();
            const name = row.getCell(3).text?.toString().trim();
            const company = row.getCell(4).text?.toString().trim();
            const division = row.getCell(5).text?.toString().trim();
            const department = row.getCell(6).text?.toString().trim();
            const password = row.getCell(7).text?.toString().trim();
            const canteenId = row.getCell(8).text?.toString().trim();

            if (!externalId || !name || !company || !division || !department) {
                errors.push({ row: rowNumber + 1, error: 'Missing required fields' });
                return;
            }

            // Validate NIK is numeric if provided
            if (nik && !/^\d+$/.test(nik)) {
                errors.push({ row: rowNumber + 1, error: 'NIK harus berupa angka' });
                return;
            }

            users.push({ externalId, nik, name, company, division, department, password, canteenId });
        });

        // Auto-create canteens that don't exist (lookup by NAME, not ID)
        const uniqueCanteenNames = [...new Set(users.map(u => u.canteenId).filter(Boolean))] as string[];
        const canteenIdMap = new Map<string, string>(); // name -> actual UUID id
        let canteensCreated = 0;

        // Get all active shifts for auto-linking new canteens
        const allActiveShifts = await prisma.shift.findMany({
            where: { isActive: true },
            select: { id: true }
        });

        for (const canteenName of uniqueCanteenNames) {
            // Look up canteen by NAME (not by id)
            let canteen = await prisma.canteen.findUnique({
                where: { name: canteenName }
            });

            if (!canteen) {
                // Create new canteen with auto-generated UUID
                canteen = await prisma.canteen.create({
                    data: {
                        name: canteenName,
                        location: 'Auto-created from user import',
                        isActive: true
                    }
                });
                canteensCreated++;

                // Auto-create CanteenShift entries for all active shifts
                if (allActiveShifts.length > 0) {
                    await prisma.canteenShift.createMany({
                        data: allActiveShifts.map(shift => ({
                            canteenId: canteen!.id,
                            shiftId: shift.id,
                            isActive: true
                        })),
                        skipDuplicates: true
                    });
                }
            }

            // Store the mapping: canteenName -> canteen.id (proper UUID)
            canteenIdMap.set(canteenName, canteen.id);
        }

        // Auto-create Company > Division > Department hierarchy
        // Build a map for quick lookup: "company|division|department" -> departmentId
        const orgStructureMap = new Map<string, string>();
        const uniqueOrgPaths = [...new Set(users.map(u => `${u.company}|${u.division}|${u.department}`))];

        let companiesCreated = 0;
        let divisionsCreated = 0;
        let departmentsCreated = 0;

        for (const orgPath of uniqueOrgPaths) {
            const [companyName, divisionName, departmentName] = orgPath.split('|');

            // 1. Upsert Company
            let company = await prisma.company.findUnique({ where: { name: companyName } });
            if (!company) {
                company = await prisma.company.create({
                    data: { name: companyName, isActive: true }
                });
                companiesCreated++;
            }

            // 2. Upsert Division (unique within company)
            let division = await prisma.division.findFirst({
                where: { companyId: company.id, name: divisionName }
            });
            if (!division) {
                division = await prisma.division.create({
                    data: { name: divisionName, companyId: company.id, isActive: true }
                });
                divisionsCreated++;
            }

            // 3. Upsert Department (unique within division)
            let department = await prisma.department.findFirst({
                where: { divisionId: division.id, name: departmentName }
            });
            if (!department) {
                department = await prisma.department.create({
                    data: { name: departmentName, divisionId: division.id, isActive: true }
                });
                departmentsCreated++;
            }

            // Store departmentId for lookup
            orgStructureMap.set(orgPath, department.id);
        }

        // Import users with upsert
        const results = {
            created: 0,
            updated: 0,
            failed: 0,
            canteensCreated,
            companiesCreated,
            divisionsCreated,
            departmentsCreated
        };
        const defaultPassword = await bcrypt.hash('default123', 10);

        for (const userData of users) {
            try {
                const hashedPwd = userData.password
                    ? await bcrypt.hash(userData.password, 10)
                    : defaultPassword;

                // Get departmentId from org structure map
                const orgPath = `${userData.company}|${userData.division}|${userData.department}`;
                const departmentId = orgStructureMap.get(orgPath);

                // Get actual canteen UUID from our mapping
                const preferredCanteenId = userData.canteenId
                    ? canteenIdMap.get(userData.canteenId) || undefined
                    : undefined;

                await prisma.user.upsert({
                    where: { externalId: userData.externalId },
                    update: {
                        name: userData.name,
                        nik: userData.nik || undefined,
                        company: userData.company,
                        division: userData.division,
                        department: userData.department,
                        departmentId: departmentId || undefined,
                        isActive: true,
                        preferredCanteenId: preferredCanteenId,
                    },
                    create: {
                        externalId: userData.externalId,
                        nik: userData.nik || null,
                        name: userData.name,
                        company: userData.company,
                        division: userData.division,
                        department: userData.department,
                        departmentId: departmentId || null,
                        password: hashedPwd,
                        role: 'USER',
                        mustChangePassword: true,
                        preferredCanteenId: preferredCanteenId || null,
                    },
                });
                results.created++;
            } catch (error) {
                results.failed++;
                errors.push({ externalId: userData.externalId, error: 'Failed to import' });
            }
        }

        if (results.created > 0) {
            await logDataOperation('IMPORT_DATA', req.user || null, context, {
                dataType: 'Users',
                recordCount: results.created,
                filename: req.file.originalname,
                metadata: { created: results.created, updated: results.updated, failed: results.failed }
            });
        }

        res.json({
            message: `Imported ${results.created} users successfully`,
            results,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: 'Failed to import users' });
    }
});

// Export users template
router.get('/export/template', authMiddleware, adminMiddleware, apiRateLimitMiddleware('export'), async (req: AuthRequest, res: Response) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Users');

        worksheet.columns = [
            { header: 'ID', key: 'externalId', width: 15 },
            { header: 'NIK', key: 'nik', width: 15 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Company', key: 'company', width: 20 },
            { header: 'Division', key: 'division', width: 20 },
            { header: 'Department', key: 'department', width: 20 },
            { header: 'Password', key: 'password', width: 20 },
            { header: 'Canteen ID', key: 'canteenId', width: 20 },
        ];

        // Style header
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F81BD' },
        };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="user_import_template.xlsx"');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Export template error:', error);
        res.status(500).json({ error: 'Failed to generate template' });
    }
});

// Reset user password (Admin only)
router.post('/:id/reset-password', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const { newPassword, reason } = req.body;

        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, externalId: true, name: true, email: true, role: true }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Use provided password or default
        const password = newPassword || 'default123';
        const hashedPassword = await bcrypt.hash(password, 10);

        await prisma.user.update({
            where: { id: req.params.id },
            data: {
                password: hashedPassword,
                mustChangePassword: true,
            },
        });

        // Log audit for password reset by admin
        await logUserManagement('UPDATE', req.user || null, user, context, {
            metadata: {
                action: 'PASSWORD_RESET_BY_ADMIN',
                targetUserId: user.id,
                targetUserName: user.name,
                targetExternalId: user.externalId,
                reason: reason?.trim() || 'No reason provided',
                requiresChange: true,
            }
        });

        res.json({
            message: 'Password reset successfully',
            requiresChange: true,
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

export default router;
