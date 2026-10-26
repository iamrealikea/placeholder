/**
 * Challenger 2 Stress Test Suite for Milestone 1 (RBAC & User Management)
 * Tests:
 * 1. GET /api/admin/users?role=staff, ?role=customer, ?role=admin, ?role=all, ?role=nonexistent
 * 2. GET /api/admin/users?search=<substring> matching name, email, phone, and no match
 * 3. Invalid roles in PUT /api/admin/users/:id/role: superadmin, '', null, 123, {} -> verify HTTP 400
 * 4. Unknown user ID in PUT /api/admin/users/:id/role -> verify HTTP 404
 * 5. Inspect data/notifications.json to verify ROLE_UPDATED notification record
 * 6. Permission barriers (401 unauth, 403 customer/staff) & Self-demotion guard
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'tickethub-secret-key-2026';

const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { app, expirationInterval } = require('../server');
const { store } = require('../src/store/jsonStore');
const { generateSeedData, ensureTicketQrCodes } = require('../src/store/seed');

let server;
let BASE_URL;

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { ...(options.headers || {}) };
  let body = options.body;

  if (body !== undefined && typeof body === 'object' && !(body instanceof Buffer)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: ['GET', 'HEAD'].includes(options.method || 'GET') ? undefined : body
  });

  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = await res.text();
  }

  return {
    status: res.status,
    headers: res.headers,
    data
  };
}

async function runAllStressTests() {
  const results = [];
  function record(testName, passed, details = '') {
    results.push({ testName, passed, details });
    const mark = passed ? '✔ PASS' : '✖ FAIL';
    console.log(`${mark}: ${testName} ${details ? '(' + details + ')' : ''}`);
    if (!passed) {
      console.error(`  Assertion failure: ${details}`);
    }
  }

  try {
    // 0. Setup: deterministic seed and server bind
    store.resetWithSeed(generateSeedData);
    await ensureTicketQrCodes(store);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    BASE_URL = `http://127.0.0.1:${server.address().port}`;
    console.log(`Server bound to ${BASE_URL}`);

    // Auth logins
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@ticket.com', password: 'admin123' }
    });
    assert.strictEqual(adminLogin.status, 200, 'Admin login failed');
    const adminToken = adminLogin.data.token;

    const staffLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'staff@ticket.com', password: 'staff123' }
    });
    assert.strictEqual(staffLogin.status, 200, 'Staff login failed');
    const staffToken = staffLogin.data.token;

    const customerLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'user@ticket.com', password: 'password123' }
    });
    assert.strictEqual(customerLogin.status, 200, 'Customer login failed');
    const customerToken = customerLogin.data.token;

    // =========================================================================
    // Group 1: Role Filtering (GET /api/admin/users?role=...)
    // =========================================================================
    console.log('\n--- Group 1: Role Filtering ---');

    // 1.1 role=staff
    {
      const res = await request('/api/admin/users?role=staff', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const ok = res.status === 200 &&
        res.data.counts.total === 3 &&
        res.data.counts.staff === 1 &&
        res.data.users.length === 1 &&
        res.data.users.every((u) => u.role === 'staff' && u.passwordHash === undefined);
      record('1.1 GET /api/admin/users?role=staff returns only staff and global counts', ok, `returned ${res.data?.users?.length} users`);
    }

    // 1.2 role=customer
    {
      const res = await request('/api/admin/users?role=customer', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const ok = res.status === 200 &&
        res.data.counts.total === 3 &&
        res.data.counts.customer === 1 &&
        res.data.users.length === 1 &&
        res.data.users.every((u) => u.role === 'customer' && u.passwordHash === undefined);
      record('1.2 GET /api/admin/users?role=customer returns only customer', ok, `returned ${res.data?.users?.length} users`);
    }

    // 1.3 role=admin
    {
      const res = await request('/api/admin/users?role=admin', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const ok = res.status === 200 &&
        res.data.counts.total === 3 &&
        res.data.counts.admin === 1 &&
        res.data.users.length === 1 &&
        res.data.users.every((u) => u.role === 'admin' && u.passwordHash === undefined);
      record('1.3 GET /api/admin/users?role=admin returns only admin', ok, `returned ${res.data?.users?.length} users`);
    }

    // 1.4 role=all
    {
      const res = await request('/api/admin/users?role=all', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const ok = res.status === 200 &&
        res.data.counts.total === 3 &&
        res.data.users.length === 3 &&
        res.data.users.every((u) => u.passwordHash === undefined);
      record('1.4 GET /api/admin/users?role=all returns all users', ok, `returned ${res.data?.users?.length} users`);
    }

    // 1.5 role=nonexistent
    {
      const res = await request('/api/admin/users?role=nonexistent', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const ok = res.status === 200 &&
        res.data.counts.total === 3 &&
        res.data.users.length === 0;
      record('1.5 GET /api/admin/users?role=nonexistent returns empty array and global counts', ok, `returned ${res.data?.users?.length} users`);
    }

    // 1.6 case-insensitive & trimmed roles (e.g. '  STAFF  ')
    {
      const res = await request('/api/admin/users?role=%20%20STAFF%20%20', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const ok = res.status === 200 &&
        res.data.users.length === 1 &&
        res.data.users[0].role === 'staff';
      record('1.6 GET /api/admin/users?role=  STAFF   handles whitespace and uppercase', ok);
    }

    // =========================================================================
    // Group 2: Substring Search (GET /api/admin/users?search=...)
    // =========================================================================
    console.log('\n--- Group 2: Substring Search ---');

    // 2.1 Name search (case-insensitive substring)
    {
      const res = await request('/api/admin/users?search=chanita', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const ok = res.status === 200 &&
        res.data.users.length === 1 &&
        res.data.users[0].name === 'Chanita Chansamrong' &&
        res.data.users[0].passwordHash === undefined;
      record('2.1 GET /api/admin/users?search=chanita matches user name', ok, `matched ${res.data?.users?.[0]?.name}`);
    }

    // 2.2 Email search
    {
      const res = await request('/api/admin/users?search=staff@ticket.com', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const ok = res.status === 200 &&
        res.data.users.length === 1 &&
        res.data.users[0].email === 'staff@ticket.com' &&
        res.data.users[0].passwordHash === undefined;
      record('2.2 GET /api/admin/users?search=staff@ticket.com matches email', ok);
    }

    // 2.3 Phone search
    {
      const res = await request('/api/admin/users?search=0899999999', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const ok = res.status === 200 &&
        res.data.users.length === 1 &&
        res.data.users[0].phone === '0899999999' &&
        res.data.users[0].name === 'Sirawit Admin';
      record('2.3 GET /api/admin/users?search=0899999999 matches phone number', ok);
    }

    // 2.4 No match
    {
      const res = await request('/api/admin/users?search=nomatch_user_xyz', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const ok = res.status === 200 &&
        res.data.users.length === 0 &&
        res.data.counts.total === 3;
      record('2.4 GET /api/admin/users?search=nomatch_user_xyz returns empty array', ok);
    }

    // 2.5 Combined search and role filter
    {
      const res1 = await request('/api/admin/users?role=customer&search=Chanita', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const res2 = await request('/api/admin/users?role=staff&search=Chanita', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const ok = res1.status === 200 && res1.data.users.length === 1 &&
                 res2.status === 200 && res2.data.users.length === 0;
      record('2.5 Combined ?role= & ?search= filters concurrently', ok);
    }

    // 2.6 Sanitization check across all users
    {
      const res = await request('/api/admin/users', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const hasPassword = res.data.users.some((u) => u.passwordHash !== undefined || u.password !== undefined);
      record('2.6 Strict sanitization check: passwordHash/password never leaked', !hasPassword);
    }

    // =========================================================================
    // Group 3: Invalid Roles in PUT /api/admin/users/:id/role
    // =========================================================================
    console.log('\n--- Group 3: Invalid Role Payloads (HTTP 400) ---');

    const targetId = 'usr-customer-1';
    const invalidRoles = [
      { label: 'superadmin', payload: { role: 'superadmin' } },
      { label: 'empty string', payload: { role: '' } },
      { label: 'null', payload: { role: null } },
      { label: 'number 123', payload: { role: 123 } },
      { label: 'empty object {}', payload: { role: {} } },
      { label: 'array ["admin"]', payload: { role: ['admin'] } },
      { label: 'whitespace only "   "', payload: { role: '   ' } },
      { label: 'boolean true', payload: { role: true } },
      { label: 'missing role key', payload: {} }
    ];

    for (const testCase of invalidRoles) {
      const res = await request(`/api/admin/users/${targetId}/role`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: testCase.payload
      });
      const ok = res.status === 400 &&
        res.data &&
        typeof res.data.error === 'string' &&
        res.data.error.includes('Invalid role. Role must be one of: customer, staff, admin.');
      record(`3.x PUT invalid role [${testCase.label}] rejected with HTTP 400`, ok, `status: ${res.status}, error: "${res.data?.error}"`);
    }

    // Verify user role untouched
    {
      const checkUser = store.findById('users', targetId);
      record('3.10 Target user role remained "customer" after invalid attempts', checkUser.role === 'customer');
    }

    // =========================================================================
    // Group 4: Unknown User ID in PUT /api/admin/users/:id/role
    // =========================================================================
    console.log('\n--- Group 4: Unknown User ID (HTTP 404) ---');

    {
      const unknownId = 'usr-nonexistent-id-99999';
      const res = await request(`/api/admin/users/${unknownId}/role`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { role: 'staff' }
      });
      const ok = res.status === 404 && res.data && res.data.error === 'User not found.';
      record(`4.1 PUT unknown user ID ${unknownId} returns HTTP 404`, ok, `status: ${res.status}, error: "${res.data?.error}"`);
    }

    // =========================================================================
    // Group 5: Self-Demotion Guard
    // =========================================================================
    console.log('\n--- Group 5: Self-Demotion Guard (HTTP 400) ---');

    {
      const adminId = 'usr-admin-1';
      const res = await request(`/api/admin/users/${adminId}/role`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { role: 'customer' }
      });
      const ok = res.status === 400 &&
        res.data &&
        res.data.error === 'Cannot demote your own currently active administrator account.';
      record('5.1 Self-demotion of active admin rejected with HTTP 400', ok, `status: ${res.status}, error: "${res.data?.error}"`);
    }

    // =========================================================================
    // Group 6: Valid Role Updates and data/notifications.json Verification
    // =========================================================================
    console.log('\n--- Group 6: Valid Role Updates & notifications.json Inspection ---');

    const notificationsFile = path.join(__dirname, '..', 'data', 'notifications.json');
    const notifsBeforeRaw = fs.readFileSync(notificationsFile, 'utf8');
    const notifsBefore = JSON.parse(notifsBeforeRaw);

    // 6.1 Promote customer to staff
    const promoteRes = await request(`/api/admin/users/${targetId}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { role: 'staff' }
    });

    const promoteOk = promoteRes.status === 200 &&
      promoteRes.data.message === 'User role updated successfully.' &&
      promoteRes.data.user.role === 'staff' &&
      promoteRes.data.user.passwordHash === undefined;
    record('6.1 Promote customer to staff returns HTTP 200 with sanitized user', promoteOk);

    // 6.2 Inspect data/notifications.json on disk
    const notifsAfterPromoteRaw = fs.readFileSync(notificationsFile, 'utf8');
    const notifsAfterPromote = JSON.parse(notifsAfterPromoteRaw);

    const newNotif = notifsAfterPromote.find(
      (n) => n.userId === targetId && n.type === 'ROLE_UPDATED' && n.message.includes('"staff"')
    );

    const hasValidUuidSuffix = newNotif && /^ntf-[0-9a-f]{8}$/i.test(newNotif.id);
    const hasValidIsoTime = newNotif && !isNaN(Date.parse(newNotif.createdAt));
    const notifDetailsOk = newNotif &&
      newNotif.userId === targetId &&
      newNotif.channel === 'BOTH' &&
      newNotif.type === 'ROLE_UPDATED' &&
      newNotif.subject === 'Account Role Updated' &&
      newNotif.message === 'Your account role has been updated to "staff".' &&
      newNotif.emailTo === 'user@ticket.com' &&
      newNotif.isRead === false &&
      hasValidUuidSuffix &&
      hasValidIsoTime;

    record(
      '6.2 Inspect data/notifications.json: genuine ROLE_UPDATED record created with valid UUID, correct recipient, subject & message',
      Boolean(notifDetailsOk),
      `id: ${newNotif?.id}, recipient: ${newNotif?.userId}, type: ${newNotif?.type}`
    );

    // 6.3 Verify promoted user has dynamic staff ticket permissions
    {
      const ticketValidateRes = await request('/api/tickets/validate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { ticketCode: 'TKT-TEST-DUMMY' }
      });
      // Should NOT be 403 (it should reach ticket lookup, returning 404 or 400 for dummy code)
      const allowed = ticketValidateRes.status !== 403;
      record('6.3 Promoted user immediately gains staff permission on /api/tickets/validate', allowed, `status: ${ticketValidateRes.status}`);
    }

    // 6.4 Demote back to customer
    const demoteRes = await request(`/api/admin/users/${targetId}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { role: 'customer' }
    });

    const demoteOk = demoteRes.status === 200 &&
      demoteRes.data.user.role === 'customer' &&
      demoteRes.data.user.passwordHash === undefined;
    record('6.4 Demote back to customer returns HTTP 200 with sanitized user', demoteOk);

    // 6.5 Inspect second notification in data/notifications.json
    const notifsAfterDemoteRaw = fs.readFileSync(notificationsFile, 'utf8');
    const notifsAfterDemote = JSON.parse(notifsAfterDemoteRaw);

    const secondNotif = notifsAfterDemote.find(
      (n) => n.userId === targetId && n.type === 'ROLE_UPDATED' && n.message.includes('"customer"')
    );

    const secondNotifOk = secondNotif &&
      secondNotif.userId === targetId &&
      secondNotif.type === 'ROLE_UPDATED' &&
      secondNotif.message === 'Your account role has been updated to "customer".' &&
      /^ntf-[0-9a-f]{8}$/i.test(secondNotif.id);
    record('6.5 Second ROLE_UPDATED notification logged in notifications.json for customer demotion', Boolean(secondNotifOk));

    // 6.6 Verify demoted user loses staff ticket validation permissions
    {
      const ticketValidateRes = await request('/api/tickets/validate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { ticketCode: 'TKT-TEST-DUMMY' }
      });
      const blocked = ticketValidateRes.status === 403;
      record('6.6 Demoted user immediately loses ticket validation privileges (HTTP 403)', blocked, `status: ${ticketValidateRes.status}`);
    }

    // =========================================================================
    // Group 7: Authorization Protection (401 / 403)
    // =========================================================================
    console.log('\n--- Group 7: RBAC Access Protection ---');

    {
      const unauthUsers = await request('/api/admin/users');
      record('7.1 Unauthenticated GET /api/admin/users returns HTTP 401', unauthUsers.status === 401);

      const customerUsers = await request('/api/admin/users', {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      record('7.2 Customer GET /api/admin/users returns HTTP 403', customerUsers.status === 403);

      const staffUsers = await request('/api/admin/users', {
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      record('7.3 Staff GET /api/admin/users returns HTTP 403', staffUsers.status === 403);

      const customerPut = await request(`/api/admin/users/${targetId}/role`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { role: 'admin' }
      });
      record('7.4 Customer privilege escalation PUT /role returns HTTP 403', customerPut.status === 403);

      const staffPut = await request(`/api/admin/users/${targetId}/role`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${staffToken}` },
        body: { role: 'admin' }
      });
      record('7.5 Staff privilege escalation PUT /role returns HTTP 403', staffPut.status === 403);
    }

  } finally {
    if (expirationInterval) clearInterval(expirationInterval);
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('\nTest server shut down gracefully.');
    }
  }

  // Summary
  const failed = results.filter((r) => !r.passed);
  console.log(`\n=======================================================`);
  console.log(`STRESS TEST SUMMARY: ${results.length - failed.length}/${results.length} PASSED`);
  if (failed.length > 0) {
    console.log(`FAILED TESTS (${failed.length}):`);
    for (const f of failed) {
      console.log(`- ${f.testName}: ${f.details}`);
    }
  }
  console.log(`=======================================================\n`);

  return failed.length === 0;
}

runAllStressTests().then((success) => {
  if (!success) {
    process.exit(1);
  }
}).catch((err) => {
  console.error('Unhandled test exception:', err);
  process.exit(1);
});
