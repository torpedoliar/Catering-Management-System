
// Internal container URL
const API_URL = 'http://localhost:3012/api';
// Credentials from seed.ts
const ADMIN_ID = 'ADMIN001';
const ADMIN_PASSWORD = 'admin123';

async function verify() {
    let token;
    let createdUserId;
    const testExternalId = `TEST_USER_${Date.now()}`;

    console.log('--- Starting Verification (using fetch) ---');
    console.log(`Target: ${API_URL}`);

    // Helper for requests
    async function request(path, options = {}) {
        const url = `${API_URL}${path}`;
        const res = await fetch(url, options);
        return res;
    }

    // 1. LOGIN
    try {
        console.log('logging in...');
        const res = await request('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                externalId: ADMIN_ID,
                password: ADMIN_PASSWORD
            })
        });

        if (!res.ok) {
            throw new Error(`Login failed with status ${res.status}`);
        }

        const data = await res.json();
        token = data.token;
        console.log('✅ Login successful');
    } catch (error) {
        console.error('❌ Login failed:', error.message);
        return;
    }

    const authHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    // 2. VERIFY EXPORT TEMPLATE HEADERS
    try {
        console.log('Testing User Export Template...');
        const res = await request('/users/export/template', {
            headers: authHeaders
        });

        const contentType = res.headers.get('content-type');
        const contentDisposition = res.headers.get('content-disposition');

        if (contentType && contentType.includes('spreadsheetml.sheet') &&
            contentDisposition && contentDisposition.includes('user_import_template.xlsx')) {
            console.log('✅ User Export Template headers correct');
        } else {
            console.error('❌ User Export Template headers incorrect:', { contentType, contentDisposition });
        }
    } catch (error) {
        console.error('❌ User Export Template failed:', error.message);
    }

    // 3. VERIFY TRANSACTION EXPORT HEADERS
    try {
        console.log('Testing Transaction Export...');
        const res = await request('/orders/export', {
            headers: authHeaders
        });

        const contentType = res.headers.get('content-type');
        const contentDisposition = res.headers.get('content-disposition');

        if (contentType && contentType.includes('spreadsheetml.sheet') &&
            contentDisposition && contentDisposition.includes('transactions_')) {
            console.log('✅ Transaction Export headers correct');
        } else {
            console.error('❌ Transaction Export headers incorrect:', { contentType, contentDisposition });
        }
    } catch (error) {
        console.error('❌ Transaction Export failed:', error.message);
    }

    // 4. VERIFY DELETE USER FLOW
    try {
        console.log('Testing Delete User Flow...');

        // 4a. Create User
        console.log(`Creating user ${testExternalId}...`);
        const createRes = await request('/users', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                externalId: testExternalId,
                name: 'Test Verification',
                email: `${testExternalId}@example.com`,
                password: 'password123',
                company: 'Test Co',
                division: 'Test Div',
                department: 'Test Dept'
            })
        });

        if (!createRes.ok) {
            const err = await createRes.text();
            throw new Error(`Create user failed: ${createRes.status} ${err}`);
        }

        const userData = await createRes.json();
        createdUserId = userData.id;
        console.log('✅ User created');

        // 4b. Delete User
        console.log(`Deleting user ${testExternalId}...`);
        const deleteRes = await request(`/users/${createdUserId}`, {
            method: 'DELETE',
            headers: authHeaders
        });

        if (!deleteRes.ok) throw new Error(`Delete failed: ${deleteRes.status}`);
        console.log('✅ User deleted');

        // 4c. Create User AGAIN (Same ID)
        console.log(`Re-creating user ${testExternalId} (should succeed)...`);
        const reCreateRes = await request('/users', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                externalId: testExternalId,
                name: 'Test Verification 2',
                email: `${testExternalId}@example.com`, // Same email logic check
                password: 'password123',
                company: 'Test Co',
                division: 'Test Div',
                department: 'Test Dept'
            })
        });

        if (reCreateRes.ok) {
            console.log('✅ User re-created successfully (Delete logic works!)');
            const newUserData = await reCreateRes.json();

            // Cleanup: Delete the re-created user
            await request(`/users/${newUserData.id}`, {
                method: 'DELETE',
                headers: authHeaders
            });
            console.log('✅ Cleanup successful');
        } else {
            const err = await reCreateRes.text();
            console.error('❌ User re-creation status unexpected:', reCreateRes.status, err);
        }

    } catch (error) {
        console.error('❌ Delete User Flow failed:', error.message);
    }
}

verify();
