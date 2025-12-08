import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create default settings
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
    console.log('✅ Settings created');

    // Create default shifts
    const shifts = [
        { name: 'Shift 1', startTime: '08:00', endTime: '12:00' },
        { name: 'Shift 2', startTime: '12:00', endTime: '15:00' },
        { name: 'Shift 3', startTime: '15:00', endTime: '18:00' },
    ];

    for (const shift of shifts) {
        await prisma.shift.upsert({
            where: { name: shift.name },
            update: { startTime: shift.startTime, endTime: shift.endTime },
            create: shift,
        });
    }
    console.log('✅ Shifts created');

    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await prisma.user.upsert({
        where: { externalId: 'ADMIN001' },
        update: {},
        create: {
            externalId: 'ADMIN001',
            name: 'System Admin',
            email: 'admin@company.com',
            password: hashedPassword,
            company: 'Company',
            division: 'IT',
            department: 'Administration',
            role: 'ADMIN',
        },
    });
    console.log('✅ Admin user created (ID: ADMIN001, Password: admin123)');

    // Create canteen staff user
    await prisma.user.upsert({
        where: { externalId: 'CANTEEN001' },
        update: {},
        create: {
            externalId: 'CANTEEN001',
            name: 'Canteen Staff',
            email: 'canteen@company.com',
            password: hashedPassword,
            company: 'Company',
            division: 'Operations',
            department: 'Canteen',
            role: 'CANTEEN',
        },
    });
    console.log('✅ Canteen user created (ID: CANTEEN001, Password: admin123)');

    // Create sample regular users
    const sampleUsers = [
        { externalId: 'EMP001', name: 'John Doe', company: 'Company A', division: 'Engineering', department: 'Software' },
        { externalId: 'EMP002', name: 'Jane Smith', company: 'Company A', division: 'Engineering', department: 'Hardware' },
        { externalId: 'EMP003', name: 'Bob Wilson', company: 'Company B', division: 'Marketing', department: 'Digital' },
    ];

    // Create user YANTO with 2 no-shows
    await prisma.user.upsert({
        where: { externalId: '2200210' },
        update: {},
        create: {
            externalId: '2200210',
            name: 'YANTO',
            email: '2200210@sja.com',
            password: hashedPassword,
            company: 'SJA',
            division: 'PRODUKSI',
            department: 'UPBM',
            role: 'USER',
            noShowCount: 2,
        },
    });
    console.log('✅ User YANTO created (ID: 2200210, noShowCount: 2)');

    for (const user of sampleUsers) {
        await prisma.user.upsert({
            where: { externalId: user.externalId },
            update: {},
            create: {
                ...user,
                email: `${user.externalId.toLowerCase()}@company.com`,
                password: hashedPassword,
                role: 'USER',
            },
        });
    }
    console.log('✅ Sample users created');

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
