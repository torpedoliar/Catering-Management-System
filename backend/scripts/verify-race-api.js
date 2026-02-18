
// Native fetch is available in Node 18+
const API_URL = 'http://localhost:3000/api';
const ADMIN_ID = 'ADMIN001';
const ADMIN_PASSWORD = 'admin123';

async function main() {
    console.log("---------------------------------------------------");
    console.log("🏎️ VERIFICATION (API): Race Condition (Double Check-in)");
    console.log("---------------------------------------------------");

    try {
        // 1. Login
        console.log("🔑 Logging in...");
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ externalId: ADMIN_ID, password: ADMIN_PASSWORD })
        });

        if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status} ${loginRes.statusText}`);
        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log("✅ Login successful");

        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        // 2. Create Order
        // We need a shift first. Let's list shifts to get an ID.
        const shiftsRes = await fetch(`${API_URL}/shifts`, { headers: authHeaders });
        const shifts = await shiftsRes.json();
        const shift = shifts.shifts?.find(s => s.isActive) || shifts[0]; // shifts might be wrapped

        if (!shift) throw new Error("No active shifts found");
        console.log(`📅 Using Shift: ${shift.name} (${shift.id})`);

        // Create order for today
        const today = new Date().toISOString().split('T')[0];
        console.log(`📦 Creating Order for ${today}...`);

        const createRes = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                shiftId: shift.id,
                orderDate: today
            })
        });

        const orderData = createRes.json();
        let qrCode;

        if (createRes.status === 400) {
            // Might already exist, that's fine, let's try to get it
            console.log("   Order might already exist/duplicate. Trying to find recent order...");
            // Actually, if it exists, we can't easily get the QR code without listing orders.
            // Let's assume testing on a clean-ish state or ignored for now.
            // If we can't create, we can't test easily without listing.
            // Let's list orders.
            const ordersRes = await fetch(`${API_URL}/orders?startDate=${today}&endDate=${today}`, { headers: authHeaders });
            const orders = await ordersRes.json();
            // Assuming structure
            const order = orders.orders?.[0] || orders[0];
            if (!order) throw new Error("Could not create or find order");
            qrCode = order.qrCode;
            // Reset status if needed? We can't via API easily.
            if (order.status !== 'ORDERED') {
                console.log(`   Order ${order.id} is ${order.status}. Cannot test race condition properly if already picked up.`);
                // Proceed anyway, maybe we catch "Already picked up" x5
            } else {
                console.log(`✅ Using existing order: ${order.qrCode}`);
            }
        } else if (createRes.ok) {
            const data = await createRes.json(); // Wait for json
            qrCode = data.qrCode;
            console.log(`✅ Created Order: ${qrCode}`);
        } else {
            const txt = await createRes.text();
            throw new Error(`Create order failed: ${txt}`);
        }

        if (!qrCode) throw new Error("No QR Code available");

        // 3. Fire Concurrent Check-ins
        console.log("🚀 Firing 5 concurrent check-in attempts...");
        const attempts = Array(5).fill(0).map(async (_, i) => {
            const res = await fetch(`${API_URL}/checkin/qr`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ qrCode })
            });
            const data = await res.json();
            return {
                index: i,
                status: res.status,
                success: res.ok,
                message: data.message || data.error
            };
        });

        const results = await Promise.all(attempts);

        // 4. Analyze
        const successes = results.filter(r => r.success).length;
        const failures = results.filter(r => !r.success).length;

        console.log(`📊 Results: ${successes} Successes, ${failures} Failures`);
        results.forEach(r => console.log(`   [${r.index}] ${r.status}: ${r.message}`));

        if (successes === 1 && failures === 4) {
            console.log("✅ PASS: Exactly one request succeeded.");
        } else if (successes === 0) {
            console.log("❌ FAIL: No requests succeeded (Maybe already picked up?)");
            process.exit(1);
        } else {
            console.log("❌ FAIL: Multiple requests succeeded (Race condition exists!)");
            process.exit(1);
        }

    } catch (e) {
        console.error("❌ Error:", e);
        process.exit(1);
    }
}

main();
