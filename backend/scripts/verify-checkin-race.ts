
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
    console.log("---------------------------------------------------");
    console.log("🏎️ VERIFICATION: Race Condition (Double Check-in)");
    console.log("---------------------------------------------------");

    // 1. Setup: Create a dummy order
    // We need a user and a shift first, usually. For simplicity, let's try to find an existing one or create a dummy.
    // Actually, creating a dummy is safer.

    // Find a shift to attach to
    const shift = await prisma.shift.findFirst();
    if (!shift) {
        console.error("❌ No shifts found to test with.");
        return;
    }

    // Find a user
    const user = await prisma.user.findFirst();
    if (!user) {
        console.error("❌ No users found to test with.");
        return;
    }

    const qrCode = `TEST-RACE-${uuidv4()}`;
    const order = await prisma.order.create({
        data: {
            userId: user.id,
            shiftId: shift.id,
            orderDate: new Date(),
            qrCode: qrCode,
            mealPrice: 0,
            status: 'ORDERED'
        }
    });

    console.log(`📝 Created Test Order: ${qrCode} (Status: ${order.status})`);

    // 2. Simulate Concurrent Requests
    // We will fire 5 promises that all try to run the ATOMIC UPDATE logic.
    console.log("🚀 Firing 5 concurrent check-in attempts...");

    const attempts = Array(5).fill(0).map(async (_, index) => {
        try {
            // This is the EXACT logic we implemented in checkin.ts
            const result = await prisma.order.updateMany({
                where: {
                    qrCode: qrCode,
                    status: 'ORDERED' // The Safety Lock
                },
                data: {
                    status: 'PICKED_UP',
                    checkInTime: new Date()
                }
            });
            return { index, success: result.count > 0 };
        } catch (e) {
            return { index, success: false, error: e };
        }
    });

    const results = await Promise.all(attempts);

    // 3. Analyze Results
    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success).length;

    console.log(`📊 Results: ${successes} Successes, ${failures} Failures`);

    // 4. Assertions
    if (successes === 1 && failures === 4) {
        console.log("✅ PASS: Exactly one request succeeded. Atomicity is working.");
    } else {
        console.error("❌ FAIL: Atomicity failed.");
        console.error("   Expected: 1 Success");
        console.error(`   Actual:   ${successes} Successes`);
    }

    // 5. Cleanup
    await prisma.order.delete({ where: { id: order.id } });
    console.log("🧹 Cleanup complete.");

    if (successes !== 1) process.exit(1);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
