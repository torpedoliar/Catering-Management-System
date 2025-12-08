
const axios = require('axios');
const fs = require('fs');

const API_URL = 'http://localhost:3000/api';
// Credentials from seed.ts
const ADMIN_ID = 'ADMIN001';
const ADMIN_PASSWORD = 'admin123';

async function verify() {
    let token;
    let createdUserId;
    const testExternalId = `TEST_USER_${Date.now()}`;

    console.log('--- Starting Verification ---');

    // 1. LOGIN
    try {
        console.log('logging in...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            externalId: ADMIN_ID,
            password: ADMIN_PASSWORD
        });
        token = loginRes.data.token;
        console.log('✅ Login successful');
    } catch (error) {
        console.error('❌ Login failed:', error.response?.data || error.message);
        return;
    }

    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

    // 2. VERIFY EXPORT TEMPLATE HEADERS
    try {
        console.log('Testing User Export Template...');
        const res = await axios.get(`${API_URL}/users/export/template`, {
            ...authHeaders,
            responseType: 'arraybuffer' // Important to handle binary data
        });

        const contentType = res.headers['content-type'];
        const contentDisposition = res.headers['content-disposition'];

        if (contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
            contentDisposition.includes('user_import_template.xlsx')) {
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
        const res = await axios.get(`${API_URL}/orders/export`, {
            ...authHeaders,
            responseType: 'arraybuffer'
        });

        const contentType = res.headers['content-type'];
        const contentDisposition = res.headers['content-disposition'];

        if (contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
            contentDisposition.includes('transactions_')) {
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
        const createRes = await axios.post(`${API_URL}/users`, {
            externalId: testExternalId,
            name: 'Test Verification',
            email: `${testExternalId}@example.com`,
            password: 'password123',
            company: 'Test Co',
            division: 'Test Div',
            department: 'Test Dept'
        }, authHeaders);
        createdUserId = createRes.data.id;
        console.log('✅ User created');

        // 4b. Delete User
        console.log(`Deleting user ${testExternalId}...`);
        await axios.delete(`${API_URL}/users/${createdUserId}`, authHeaders);
        console.log('✅ User deleted');

        // 4c. Create User AGAIN (Same ID)
        console.log(`Re-creating user ${testExternalId} (should succeed)...`);
        const reCreateRes = await axios.post(`${API_URL}/users`, {
            externalId: testExternalId,
            name: 'Test Verification 2',
            email: `${testExternalId}@example.com`, // Same email logic check
            password: 'password123',
            company: 'Test Co',
            division: 'Test Div',
            department: 'Test Dept'
        }, authHeaders);

        if (reCreateRes.status === 201) {
            console.log('✅ User re-created successfully (Delete logic works!)');

            // Cleanup
            await axios.delete(`${API_URL}/users/${reCreateRes.data.id}`, authHeaders);
        } else {
            console.error('❌ User re-creation status unexpected:', reCreateRes.status);
        }

    } catch (error) {
        console.error('❌ Delete User Flow failed:', error.response?.data || error.message);
    }
}

verify();
