import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedAdmin() {
    console.log('🌱 Seeding admin user...');

    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Create or update admin user
    const admin = await prisma.user.upsert({
        where: { username: 'ADMIN001' },
        update: {
            name: 'Administrator',
            isActive: true
        },
        create: {
            username: 'ADMIN001',
            name: 'Administrator',
            password: hashedPassword,
            role: 'ADMIN',
            isActive: true
        }
    });

    console.log('✅ Admin user created/updated:');
    console.log(`   Username: ${admin.username}`);
    console.log(`   Name: ${admin.name}`);
    console.log(`   Role: ${admin.role}`);
    console.log('');
    console.log('🔐 Default password: admin123');
    console.log('⚠️  Please change this password after first login!');
}

seedAdmin()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error('Seed error:', e);
        await prisma.$disconnect();
        process.exit(1);
    });
