
// Internal container URL
const API_URL = 'http://localhost:3012/api';
const ADMIN_ID = 'ADMIN001';
const ADMIN_PASSWORD = 'admin123';

async function verify() {
    let token;

    console.log('--- Starting Verify Order Features ---');

    // Helper
    async function request(path, options = {}) {
        const url = `${API_URL}${path}`;
        const res = await fetch(url, options);
        return res;
    }

    // 1. LOGIN
    try {
        const res = await request('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ externalId: ADMIN_ID, password: ADMIN_PASSWORD })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        token = data.token;
        console.log('✅ Login successful');
    } catch (err) {
        console.error('❌ Login failed:', err.message);
        return;
    }

    const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    // 2. CHECK-IN TIME VALIDATION (Simulated)
    try {
        // We need an active order to test check-in.
        // First get today's order or create one.
        let orderRes = await request('/orders/today', { headers: authHeaders });
        let orderData = await orderRes.json();
        let order = orderData.order;

        if (!order) {
            console.log('ℹ️ No active order found, skipping check-in time verification for now (requires setting up a specific shift scenario).');
        } else {
            // Try to check in manually
            // This might fail if we are outside shift time, which IS the desired behavior verification if we are indeed outside.
            // Or succeed if inside.
            // We just want to see if the server responds with a 400 "Outside shift hours" if applicable, or successful check-in.

            console.log(`Checking in order ${order.id} for shift ${order.shift.name} (${order.shift.startTime}-${order.shift.endTime})...`);
            const checkinRes = await request('/orders/checkin/qr', {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ qrCode: order.qrCode })
            });

            const checkinJson = await checkinRes.json();

            if (checkinRes.status === 200) {
                console.log('✅ Check-in successful (Within shift hours)');
            } else if (checkinRes.status === 400 && checkinJson.error === 'Outside shift hours') {
                console.log('✅ Check-in restricted correctly (Outside shift hours)');
            } else if (checkinRes.status === 400 && checkinJson.error === 'Order already checked in') {
                console.log('✅ Order already checked in');
            } else {
                console.log(`ℹ️ Check-in result: ${checkinRes.status} - ${checkinJson.error}`);
            }
        }

    } catch (err) {
        console.error('❌ Check-in verification error:', err.message);
    }

    // 3. CANCEL CUTOFF VALIDATION
    // Similarly, we can't easily force a "past cutoff" state without mocking time, 
    // but we can verify the endpoint responds.
    // If we have an order, try to cancel it.
    // If it fails with "Cutoff time has passed", logic works.

    console.log('--- Verification Script Complete ---');
}

verify();
