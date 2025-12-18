import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Cleanup existing data
    // Delete in order of dependencies (children first)
    await prisma.message.deleteMany();
    await prisma.order.deleteMany();
    await prisma.announcement.deleteMany();
    await prisma.blacklist.deleteMany();
    await prisma.departmentShift.deleteMany();
    // The patch includes both `deleteMany({ where: { role: { not: 'SUPERADMIN' } } })` and `deleteMany()`.
    // `deleteMany()` will clear all users, making the first one redundant for a full cleanup.
    // Keeping `deleteMany()` for a fresh start as implied by the original comment.
    await prisma.user.deleteMany();
    await prisma.shift.deleteMany();
    await prisma.department.deleteMany();
    await prisma.division.deleteMany();
    await prisma.company.deleteMany();

    // Create default settings (upsert to be safe)
    await prisma.settings.upsert({
        where: { id: 'default' },
        update: {},
        create: {
            id: 'default',
            cutoffHours: 6,
            blacklistStrikes: 3,
            blacklistDuration: 7,
        },
    });

    // 1. Create Shifts
    const shiftsData = [
        { name: 'OFFICE HOURS', startTime: '08:00', endTime: '17:00' },
        { name: 'SHIFT 1', startTime: '07:00', endTime: '15:00' },
        { name: 'SHIFT 2', startTime: '15:00', endTime: '23:00' },
        { name: 'SHIFT 3', startTime: '23:00', endTime: '07:00' },
    ];

    const createdShifts: any = {};
    for (const s of shiftsData) {
        const shift = await prisma.shift.create({ data: s });
        createdShifts[s.name] = shift;
    }
    console.log('✅ Shifts created');

    const passwordHash = await bcrypt.hash('Robusta1927', 10);
    const company = 'SJA';

    // 2. Create Admins
    const admins = [
        { id: '001', name: 'ADRIO', dept: 'OPERATIONAL SUPPORT', div: 'ICT' },
        { id: '002', name: 'VIAN', dept: 'OPERATIONAL SUPPORT', div: 'ICT' },
    ];

    for (const admin of admins) {
        await prisma.user.create({
            data: {
                externalId: admin.id,
                name: admin.name,
                email: `${admin.name.toLowerCase()}@sja.com`,
                password: passwordHash,
                company: company,
                division: admin.div,
                department: admin.dept,
                role: 'ADMIN',
            },
        });
    }
    console.log('✅ Admins created');

    // 2.1 Create Default Agreement
    const adminUser = await prisma.user.findUnique({ where: { externalId: '001' } });
    if (adminUser) {
        await prisma.announcement.create({
            data: {
                title: 'Kebijakan Penggunaan Sistem',
                content: 'Harap membaca dan menyetujui ketentuan penggunaan sistem ini sebelum melanjutkan:\n\n1. Jaga kerahasiaan akun anda.\n2. Lakukan pemesanan sesuai jadwal.\n3. Laporkan jika ada kendala sistem.',
                type: 'AGREEMENT',
                priority: 'high',
                createdById: adminUser.id,
                isActive: true
            }
        });
        console.log('✅ Default Agreement created');
    }

    // 3. Departments structure
    const departments = [
        { div: 'ICT', name: 'OPERATIONAL SUPPORT' },
        { div: 'PRODUKSI 1', name: 'LINE A' },
        { div: 'PRODUKSI 1', name: 'LINE B' },
        { div: 'PRODUKSI 1', name: 'LINE C' },
        { div: 'PRODUKSI 2', name: 'LINE F' },
        { div: 'PRODUKSI 2', name: 'LINE I' },
    ];

    // 4. Create Random Users (Start ID 000400)
    let currentId = 400;

    for (const dept of departments) {
        const externalId = `000${currentId}`;
        const user = await prisma.user.create({
            data: {
                externalId: externalId,
                name: `User ${dept.name}`,
                email: `user${externalId}@sja.com`,
                password: passwordHash,
                company: company,
                division: dept.div,
                department: dept.name,
                role: 'USER',
            },
        });

        console.log(`✅ Created User ${user.name} (${user.externalId}) - ${dept.div} / ${dept.name}`);

        // 5. Create Orders for Dec 15 & 16, 2025 - REMOVED AS REQUESTED
        // Orders section removed to keep history clean for these dates.

        currentId++;
    }

    console.log('✅ Random Users & Orders created');
    console.log('🎉 Database seeding completed!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
