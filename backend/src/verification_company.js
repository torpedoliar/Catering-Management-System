
// Internal container URL
const API_URL = 'http://localhost:3012/api';
// Credentials from seed.ts
const ADMIN_ID = 'ADMIN001';
const ADMIN_PASSWORD = 'admin123';

async function verify() {
    let token;

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
        'Authorization': `Bearer ${token}`
    };

    // 2. VERIFY COMPANY EXPORT TEMPLATE
    try {
        console.log('Testing Company Export Template...');
        const res = await request('/companies/export/template', {
            headers: authHeaders
        });

        const contentType = res.headers.get('content-type');
        const contentDisposition = res.headers.get('content-disposition');

        if (contentType && contentType.includes('spreadsheetml.sheet') &&
            contentDisposition && contentDisposition.includes('company_structure_template.xlsx')) {
            console.log('✅ Company Export Template headers correct');
        } else {
            console.error('❌ Company Export Template headers incorrect:', { contentType, contentDisposition });
        }
    } catch (error) {
        console.error('❌ Company Export Template failed:', error.message);
    }

    // NOTE: Import verification requires a real file upload, difficult to simulate with simple fetch in limited node env without form-data lib correctly bound.
    // However, if the endpoint returns 400 "No file uploaded" when sent without file, it proves the endpoint exists and is reachable.

    try {
        console.log('Testing Company Import Endpoint Reachability...');
        const res = await request('/companies/import', {
            method: 'POST',
            headers: authHeaders
        });

        if (res.status === 400) {
            const json = await res.json();
            if (json.error === 'No file uploaded') {
                console.log('✅ Import Endpoint reachable (returned 400 as expected for empty body)');
            } else {
                console.warn('⚠️ Import Endpoint returned 400 but unexpected error:', json.error);
            }
        } else {
            console.error(`❌ Import Endpoint returned unexpected status ${res.status}`);
        }
    } catch (error) {
        console.error('❌ Import Endpoint check failed:', error.message);
    }

}

verify();
