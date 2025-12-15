import { Router, Response } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { AuthRequest, authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { logOrganization, logDataOperation, getRequestContext } from '../services/audit.service';
import { prisma } from '../lib/prisma';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ==================== COMPANY ENDPOINTS ====================

// Get all companies with divisions and departments
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const companies = await prisma.company.findMany({
            where: { isActive: true },
            include: {
                divisions: {
                    where: { isActive: true },
                    include: {
                        departments: {
                            where: { isActive: true },
                            include: {
                                defaultShift: {
                                    select: { id: true, name: true, startTime: true, endTime: true }
                                },
                                allowedShifts: {
                                    include: {
                                        shift: {
                                            select: { id: true, name: true, startTime: true, endTime: true, isActive: true }
                                        }
                                    }
                                },
                                _count: { select: { users: true } }
                            },
                            orderBy: { name: 'asc' }
                        }
                    },
                    orderBy: { name: 'asc' }
                }
            },
            orderBy: { name: 'asc' }
        });

        res.json({ companies });
    } catch (error) {
        console.error('Get companies error:', error);
        res.status(500).json({ error: 'Failed to get companies' });
    }
});

// Get company by ID
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const company = await prisma.company.findUnique({
            where: { id: req.params.id },
            include: {
                divisions: {
                    where: { isActive: true },
                    include: {
                        departments: {
                            where: { isActive: true },
                            include: {
                                defaultShift: true,
                                _count: { select: { users: true } }
                            }
                        }
                    }
                }
            }
        });

        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        res.json(company);
    } catch (error) {
        console.error('Get company error:', error);
        res.status(500).json({ error: 'Failed to get company' });
    }
});

// Create company
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const { name } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({ error: 'Company name is required' });
        }

        const company = await prisma.company.create({
            data: { name: name.trim() }
        });

        await logOrganization('CREATE', req.user || null, 'Company', company, context);

        res.status(201).json({ message: 'Company created successfully', company });
    } catch (error: any) {
        console.error('Create company error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Company with this name already exists' });
        }
        res.status(500).json({ error: 'Failed to create company' });
    }
});

// Update company
router.put('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const { name, isActive } = req.body;

        const oldCompany = await prisma.company.findUnique({ where: { id: req.params.id } });

        const company = await prisma.company.update({
            where: { id: req.params.id },
            data: {
                ...(name && { name: name.trim() }),
                ...(typeof isActive === 'boolean' && { isActive })
            }
        });

        await logOrganization('UPDATE', req.user || null, 'Company', company, context, { oldValue: oldCompany });

        res.json({ message: 'Company updated successfully', company });
    } catch (error: any) {
        console.error('Update company error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Company with this name already exists' });
        }
        res.status(500).json({ error: 'Failed to update company' });
    }
});

// Delete company (soft delete)
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const oldCompany = await prisma.company.findUnique({ where: { id: req.params.id } });

        await prisma.company.update({
            where: { id: req.params.id },
            data: { isActive: false }
        });

        if (oldCompany) {
            await logOrganization('DELETE', req.user || null, 'Company', oldCompany, context);
        }

        res.json({ message: 'Company deleted successfully' });
    } catch (error) {
        console.error('Delete company error:', error);
        res.status(500).json({ error: 'Failed to delete company' });
    }
});

// ==================== DIVISION ENDPOINTS ====================

// Create division under company
router.post('/:companyId/divisions', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const { name } = req.body;
        const { companyId } = req.params;

        if (!name?.trim()) {
            return res.status(400).json({ error: 'Division name is required' });
        }

        const division = await prisma.division.create({
            data: {
                name: name.trim(),
                companyId
            }
        });

        await logOrganization('CREATE', req.user || null, 'Division', division, context, { metadata: { companyId } });

        res.status(201).json({ message: 'Division created successfully', division });
    } catch (error: any) {
        console.error('Create division error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Division with this name already exists in this company' });
        }
        res.status(500).json({ error: 'Failed to create division' });
    }
});

// Update division
router.put('/divisions/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const { name, isActive } = req.body;

        const oldDivision = await prisma.division.findUnique({ where: { id: req.params.id } });

        const division = await prisma.division.update({
            where: { id: req.params.id },
            data: {
                ...(name && { name: name.trim() }),
                ...(typeof isActive === 'boolean' && { isActive })
            }
        });

        await logOrganization('UPDATE', req.user || null, 'Division', division, context, { oldValue: oldDivision });

        res.json({ message: 'Division updated successfully', division });
    } catch (error: any) {
        console.error('Update division error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Division with this name already exists in this company' });
        }
        res.status(500).json({ error: 'Failed to update division' });
    }
});

// Delete division (soft delete)
router.delete('/divisions/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const oldDivision = await prisma.division.findUnique({ where: { id: req.params.id } });

        await prisma.division.update({
            where: { id: req.params.id },
            data: { isActive: false }
        });

        if (oldDivision) {
            await logOrganization('DELETE', req.user || null, 'Division', oldDivision, context);
        }

        res.json({ message: 'Division deleted successfully' });
    } catch (error) {
        console.error('Delete division error:', error);
        res.status(500).json({ error: 'Failed to delete division' });
    }
});

// ==================== DEPARTMENT ENDPOINTS ====================

// Create department under division
router.post('/divisions/:divisionId/departments', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const { name, defaultShiftId, workDays } = req.body;
        const { divisionId } = req.params;

        if (!name?.trim()) {
            return res.status(400).json({ error: 'Department name is required' });
        }

        const department = await prisma.department.create({
            data: {
                name: name.trim(),
                divisionId,
                defaultShiftId: defaultShiftId || null,
                workDays: workDays || '1,2,3,4,5'
            },
            include: {
                defaultShift: true
            }
        });

        await logOrganization('CREATE', req.user || null, 'Department', department, context, { metadata: { divisionId } });

        res.status(201).json({ message: 'Department created successfully', department });
    } catch (error: any) {
        console.error('Create department error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Department with this name already exists in this division' });
        }
        res.status(500).json({ error: 'Failed to create department' });
    }
});

// Update department (including shifts and workdays)
router.put('/departments/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const { name, defaultShiftId, shiftIds, workDays, isActive } = req.body;
        const departmentId = req.params.id;

        const oldDepartment = await prisma.department.findUnique({ where: { id: departmentId } });

        // Use transaction to update department and shift relationships
        const department = await prisma.$transaction(async (tx) => {
            // If shiftIds is provided, update the DepartmentShift relationships
            if (Array.isArray(shiftIds)) {
                // Delete existing relationships
                await tx.departmentShift.deleteMany({
                    where: { departmentId }
                });

                // Create new relationships
                if (shiftIds.length > 0) {
                    await tx.departmentShift.createMany({
                        data: shiftIds.map((shiftId: string) => ({
                            departmentId,
                            shiftId
                        }))
                    });
                }
            }

            // Update department fields
            return tx.department.update({
                where: { id: departmentId },
                data: {
                    ...(name && { name: name.trim() }),
                    ...(defaultShiftId !== undefined && { defaultShiftId: defaultShiftId || null }),
                    ...(workDays && { workDays }),
                    ...(typeof isActive === 'boolean' && { isActive })
                },
                include: {
                    defaultShift: true,
                    allowedShifts: {
                        include: {
                            shift: {
                                select: { id: true, name: true, startTime: true, endTime: true, isActive: true }
                            }
                        }
                    }
                }
            });
        });

        await logOrganization('UPDATE', req.user || null, 'Department', department, context, { oldValue: oldDepartment });

        res.json({ message: 'Department updated successfully', department });
    } catch (error: any) {
        console.error('Update department error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Department with this name already exists in this division' });
        }
        res.status(500).json({ error: 'Failed to update department' });
    }
});

// Delete department (soft delete)
router.delete('/departments/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        const oldDepartment = await prisma.department.findUnique({ where: { id: req.params.id } });

        await prisma.department.update({
            where: { id: req.params.id },
            data: { isActive: false }
        });

        if (oldDepartment) {
            await logOrganization('DELETE', req.user || null, 'Department', oldDepartment, context);
        }

        res.json({ message: 'Department deleted successfully' });
    } catch (error) {
        console.error('Delete department error:', error);
        res.status(500).json({ error: 'Failed to delete department' });
    }
});

// ==================== MIGRATION HELPER ====================

// Migrate existing user data to create companies, divisions, departments
router.post('/migrate-from-users', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        // Get unique combinations from users
        const users = await prisma.user.findMany({
            where: { isActive: true },
            select: {
                company: true,
                division: true,
                department: true
            },
            distinct: ['company', 'division', 'department']
        });

        let companiesCreated = 0;
        let divisionsCreated = 0;
        let departmentsCreated = 0;

        for (const user of users) {
            // Create or get company
            let company = await prisma.company.findUnique({
                where: { name: user.company }
            });

            if (!company) {
                company = await prisma.company.create({
                    data: { name: user.company }
                });
                companiesCreated++;
            }

            // Create or get division
            let division = await prisma.division.findFirst({
                where: {
                    companyId: company.id,
                    name: user.division
                }
            });

            if (!division) {
                division = await prisma.division.create({
                    data: {
                        name: user.division,
                        companyId: company.id
                    }
                });
                divisionsCreated++;
            }

            // Create or get department
            const existingDept = await prisma.department.findFirst({
                where: {
                    divisionId: division.id,
                    name: user.department
                }
            });

            if (!existingDept) {
                await prisma.department.create({
                    data: {
                        name: user.department,
                        divisionId: division.id
                    }
                });
                departmentsCreated++;
            }
        }

        res.json({
            message: 'Migration completed successfully',
            results: {
                companiesCreated,
                divisionsCreated,
                departmentsCreated
            }
        });
    } catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({ error: 'Migration failed' });
    }
});

// ==================== IMPORT/EXPORT ENDPOINTS ====================

// Export company structure template
router.get('/export/template', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Structure');

        worksheet.columns = [
            { header: 'Company', key: 'company', width: 25 },
            { header: 'Division', key: 'division', width: 25 },
            { header: 'Department', key: 'department', width: 25 },
            { header: 'Work Days', key: 'workDays', width: 15 },
            { header: 'Shifts', key: 'shifts', width: 30 },
        ];

        // Style header
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F81BD' },
        };

        // Add Example Row
        worksheet.addRow({
            company: 'Example Company',
            division: 'Operations',
            department: 'Warehouse',
            workDays: '1,2,3,4,5',
            shifts: 'Morning Shift, Evening Shift'
        });

        const filename = 'company_structure_template.xlsx';

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Export template error:', error);
        res.status(500).json({ error: 'Failed to generate template' });
    }
});

// Import company structure
router.post('/import', authMiddleware, adminMiddleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
    const context = getRequestContext(req);
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer as any);

        const worksheet = workbook.getWorksheet(1);
        if (!worksheet) {
            return res.status(400).json({ error: 'No worksheet found' });
        }

        let companiesCreated = 0;
        let divisionsCreated = 0;
        let departmentsCreated = 0;
        const errors: any[] = [];

        // 1. Load all shifts first for lookup
        const allShifts = await prisma.shift.findMany();
        const shiftMap = new Map(allShifts.map(s => [s.name.toLowerCase(), s.id]));

        // 2. Process rows
        for (let i = 2; i <= worksheet.rowCount; i++) {
            const row = worksheet.getRow(i);
            if (!row.hasValues) continue;

            const companyName = row.getCell(1).text?.toString().trim();
            const divisionName = row.getCell(2).text?.toString().trim();
            const departmentName = row.getCell(3).text?.toString().trim();
            const workDays = row.getCell(4).text?.toString().trim() || '1,2,3,4,5';
            const shiftsStr = row.getCell(5).text?.toString().trim();

            if (!companyName || !divisionName || !departmentName) {
                continue; // Skip invalid rows
            }

            try {
                // Upsert Company
                let company = await prisma.company.findUnique({ where: { name: companyName } });
                if (!company) {
                    company = await prisma.company.create({ data: { name: companyName } });
                    companiesCreated++;
                } else if (!company.isActive) {
                    // Reactivate if needed
                    company = await prisma.company.update({
                        where: { id: company.id },
                        data: { isActive: true }
                    });
                }

                // Upsert Division
                let division = await prisma.division.findFirst({
                    where: { companyId: company.id, name: divisionName }
                });
                if (!division) {
                    division = await prisma.division.create({
                        data: { name: divisionName, companyId: company.id }
                    });
                    divisionsCreated++;
                } else if (!division.isActive) {
                    division = await prisma.division.update({
                        where: { id: division.id },
                        data: { isActive: true }
                    });
                }

                // Upsert Department
                let department = await prisma.department.findFirst({
                    where: { divisionId: division.id, name: departmentName }
                });

                if (!department) {
                    department = await prisma.department.create({
                        data: {
                            name: departmentName,
                            divisionId: division.id,
                            workDays
                        }
                    });
                    departmentsCreated++;
                } else {
                    department = await prisma.department.update({
                        where: { id: department.id },
                        data: { isActive: true, workDays }
                    });
                }

                // Handle Shifts
                if (shiftsStr) {
                    const shiftNames = shiftsStr.split(',').map(s => s.trim().toLowerCase());
                    const validShiftIds: string[] = [];

                    shiftNames.forEach(sName => {
                        if (shiftMap.has(sName)) {
                            validShiftIds.push(shiftMap.get(sName)!);
                        }
                    });

                    if (validShiftIds.length > 0) {
                        // Reset and add shifts
                        await prisma.departmentShift.deleteMany({ where: { departmentId: department.id } });
                        await prisma.departmentShift.createMany({
                            data: validShiftIds.map(shiftId => ({
                                departmentId: department.id,
                                shiftId
                            }))
                        });
                    }
                }

            } catch (err: any) {
                errors.push({ row: i, error: err.message });
            }
        }

        const totalCreated = companiesCreated + divisionsCreated + departmentsCreated;
        if (totalCreated > 0) {
            await logDataOperation('IMPORT_DATA', req.user || null, context, {
                dataType: 'Company Structure',
                recordCount: totalCreated,
                filename: req.file.originalname,
                metadata: { companiesCreated, divisionsCreated, departmentsCreated }
            });
        }

        res.json({
            message: `Import complete`,
            results: {
                companiesCreated,
                divisionsCreated,
                departmentsCreated
            },
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: 'Failed to import structure' });
    }
});

export default router;
