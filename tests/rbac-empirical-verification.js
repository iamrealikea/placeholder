/**
 * Empirical Verification Harness for RBAC API (Milestone 1)
 * Challenger: challenger_m1_1
 *
 * Verifies:
 * 1. GET /api/admin/users
 *    - Unauthenticated -> 401
 *    - Customer/Staff -> 403 Forbidden
 *    - Admin -> 200 OK
 *    - Counts integrity: { total, admin, staff, customer }
 *    - Strict data sanitization: NO passwordHash in any user
 *    - Query filters (?role=, ?search=)
 * 2. PUT /api/admin/users/:id/role
 *    - Unauthenticated -> 401
 *    - Customer/Staff -> 403 Forbidden
 *    - Unknown user ID -> 404
 *    - Invalid role payloads -> 400 Bad Request
 *    - Self-demotion guard -> 400 Bad Request ("Cannot demote your own currently active administrator account.")
 * 3. Dynamic Privilege Escalation & Token Verification:
 *    - Customer token on POST /api/tickets/validate -> 403 Forbidden
 *    - Promote customer to staff -> 200 OK
 *    - Same customer token immediately succeeds on POST /api/tickets/validate -> 200 OK
 *    - Demote staff back to customer -> 200 OK
 *    - Same customer token immediately rejected on POST /api/tickets/validate -> 403 Forbidden
 *    - ROLE_UPDATED notifications persisted
 * 4. Stress & Concurrency Edge Cases
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'tickethub-secret-key-2026';

const http = require('http');
const assert = require('assert');
const { app, expirationInterval } = require('../server');
const { store } = require('../src/store/jsonStore');
const { generateSeedData, ensureTicketQrCodes } = require('../src/store/seed');

let server;
let BASE_URL;

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { ...(options.headers || {}) };
  let body = options.body;

  if (body && typeof body === 'object' && !(body instanceof Buffer)) {
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

let passedCount = 0;
let failedCount = 0;
const results = [];

function recordTest(testName, passed, details = '') {
  if (passed) {
    passedCount++;
    console.log(`  [PASS] ${testName}`);
    results.push({ name: testName, status: 'PASS', details });
  } else {
    failedCount++;
    console.error(`  [FAIL] ${testName} - ${details}`);
    results.push({ name: testName, status: 'FAIL', details });
  }
}

async function runEmpiricalHarness() {
  console.log('===============================================================');
  console.log(' Starting Empirical RBAC Verification Harness (challenger_m1_1)');
  console.log('===============================================================');

  // Initialize and seed
  store.resetWithSeed(generateSeedData);
  await ensureTicketQrCodes(store);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  BASE_URL = `http://127.0.0.1:${port}`;
  console.log(`Test server active on ${BASE_URL}\n`);

  try {
    // 0. Setup: Obtain tokens for admin, staff, and customer
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@ticket.com', password: 'admin123' }
    });
    const adminToken = adminLogin.data.token;
    const adminUser = adminLogin.data.user;

    const staffLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'staff@ticket.com', password: 'staff123' }
    });
    const staffToken = staffLogin.data.token;
    const staffUser = staffLogin.data.user;

    const customerLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'user@ticket.com', password: 'password123' }
    });
    const customerToken = customerLogin.data.token;
    const customerUser = customerLogin.data.user;

    console.log('--- SUITE 1: GET /api/admin/users RBAC & Sanitization ---');

    // 1.1 Unauthenticated access
    const noAuthUsers = await request('/api/admin/users');
    recordTest(
      '1.1 Unauthenticated GET /api/admin/users returns 401',
      noAuthUsers.status === 401,
      `Expected 401, got ${noAuthUsers.status}`
    );

    // 1.2 Customer role access
    const customerUsersRes = await request('/api/admin/users', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    recordTest(
      '1.2 Customer GET /api/admin/users returns 403 Forbidden',
      customerUsersRes.status === 403,
      `Expected 403, got ${customerUsersRes.status}`
    );

    // 1.3 Staff role access
    const staffUsersRes = await request('/api/admin/users', {
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    recordTest(
      '1.3 Staff GET /api/admin/users returns 403 Forbidden',
      staffUsersRes.status === 403,
      `Expected 403, got ${staffUsersRes.status}`
    );

    // 1.4 Admin role access
    const adminUsersRes = await request('/api/admin/users', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    recordTest(
      '1.4 Admin GET /api/admin/users returns 200 OK',
      adminUsersRes.status === 200,
      `Expected 200, got ${adminUsersRes.status}`
    );

    // 1.5 Counts structure and mathematical validity
    const data = adminUsersRes.data;
    const countsValid =
      data &&
      data.counts &&
      typeof data.counts.total === 'number' &&
      typeof data.counts.admin === 'number' &&
      typeof data.counts.staff === 'number' &&
      typeof data.counts.customer === 'number' &&
      data.counts.total === data.counts.admin + data.counts.staff + data.counts.customer;
    recordTest(
      '1.5 Counts breakdown is structurally and mathematically valid (total = admin + staff + customer)',
      Boolean(countsValid),
      `Counts: ${JSON.stringify(data?.counts)}`
    );

    // 1.6 Strict passwordHash absence check across ALL users
    let leakedCount = 0;
    if (data && Array.isArray(data.users)) {
      for (const u of data.users) {
        if ('passwordHash' in u || u.passwordHash !== undefined) {
          leakedCount++;
        }
      }
    }
    recordTest(
      '1.6 Strict zero passwordHash leakage across all returned users',
      leakedCount === 0 && data?.users?.length > 0,
      `Leaked in ${leakedCount} user records`
    );

    // 1.7 Query filter ?role=customer
    const custFilterRes = await request('/api/admin/users?role=customer', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const onlyCustomers =
      custFilterRes.status === 200 &&
      Array.isArray(custFilterRes.data.users) &&
      custFilterRes.data.users.every((u) => u.role === 'customer') &&
      custFilterRes.data.users.length === custFilterRes.data.counts.customer;
    recordTest(
      '1.7 GET /api/admin/users?role=customer filters accurately',
      Boolean(onlyCustomers),
      `Returned ${custFilterRes.data?.users?.length} items, expected ${custFilterRes.data?.counts?.customer}`
    );

    // 1.8 Query filter ?role=staff
    const staffFilterRes = await request('/api/admin/users?role=staff', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const onlyStaff =
      staffFilterRes.status === 200 &&
      Array.isArray(staffFilterRes.data.users) &&
      staffFilterRes.data.users.every((u) => u.role === 'staff') &&
      staffFilterRes.data.users.length === staffFilterRes.data.counts.staff;
    recordTest(
      '1.8 GET /api/admin/users?role=staff filters accurately',
      Boolean(onlyStaff),
      `Returned ${staffFilterRes.data?.users?.length} items, expected ${staffFilterRes.data?.counts?.staff}`
    );

    // 1.9 Query filter ?role=admin
    const adminFilterRes = await request('/api/admin/users?role=admin', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const onlyAdmin =
      adminFilterRes.status === 200 &&
      Array.isArray(adminFilterRes.data.users) &&
      adminFilterRes.data.users.every((u) => u.role === 'admin') &&
      adminFilterRes.data.users.length === adminFilterRes.data.counts.admin;
    recordTest(
      '1.9 GET /api/admin/users?role=admin filters accurately',
      Boolean(onlyAdmin),
      `Returned ${adminFilterRes.data?.users?.length} items, expected ${adminFilterRes.data?.counts?.admin}`
    );

    // 1.10 Query filter ?role=all returns all users
    const allFilterRes = await request('/api/admin/users?role=all', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    recordTest(
      '1.10 GET /api/admin/users?role=all returns all users',
      allFilterRes.status === 200 && allFilterRes.data.users.length === allFilterRes.data.counts.total,
      `Returned ${allFilterRes.data?.users?.length} items, total is ${allFilterRes.data?.counts?.total}`
    );

    // 1.11 Query search by Name
    const searchNameRes = await request('/api/admin/users?search=Chanita', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    recordTest(
      '1.11 GET /api/admin/users?search=Chanita matches name',
      searchNameRes.status === 200 &&
        searchNameRes.data.users.some((u) => u.name.includes('Chanita')),
      `Found ${searchNameRes.data?.users?.length} matches`
    );

    // 1.12 Query search by Email
    const searchEmailRes = await request('/api/admin/users?search=staff@ticket.com', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    recordTest(
      '1.12 GET /api/admin/users?search=staff@ticket.com matches email',
      searchEmailRes.status === 200 &&
        searchEmailRes.data.users.length === 1 &&
        searchEmailRes.data.users[0].email === 'staff@ticket.com',
      `Found ${searchEmailRes.data?.users?.length} matches`
    );

    // 1.13 Query search by Phone
    const searchPhoneRes = await request('/api/admin/users?search=0899999999', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    recordTest(
      '1.13 GET /api/admin/users?search=0899999999 matches phone',
      searchPhoneRes.status === 200 &&
        searchPhoneRes.data.users.length === 1 &&
        searchPhoneRes.data.users[0].phone === '0899999999',
      `Found ${searchPhoneRes.data?.users?.length} matches`
    );

    // 1.14 Query search with non-matching term
    const searchNoneRes = await request('/api/admin/users?search=xyz_nonexistent_query', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    recordTest(
      '1.14 GET /api/admin/users?search=nonexistent returns empty list',
      searchNoneRes.status === 200 && searchNoneRes.data.users.length === 0,
      `Found ${searchNoneRes.data?.users?.length} matches`
    );

    console.log('\n--- SUITE 2: PUT /api/admin/users/:id/role Validation & Guard ---');

    // 2.1 Unauthenticated role update
    const unauthPut = await request(`/api/admin/users/${customerUser.id}/role`, {
      method: 'PUT',
      body: { role: 'staff' }
    });
    recordTest(
      '2.1 Unauthenticated PUT /api/admin/users/:id/role returns 401',
      unauthPut.status === 401,
      `Got ${unauthPut.status}`
    );

    // 2.2 Customer attempting role update
    const custPut = await request(`/api/admin/users/${customerUser.id}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { role: 'admin' }
    });
    recordTest(
      '2.2 Customer attempting PUT /api/admin/users/:id/role returns 403 Forbidden',
      custPut.status === 403,
      `Got ${custPut.status}`
    );

    // 2.3 Staff attempting role update
    const staffPut = await request(`/api/admin/users/${customerUser.id}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: { role: 'admin' }
    });
    recordTest(
      '2.3 Staff attempting PUT /api/admin/users/:id/role returns 403 Forbidden',
      staffPut.status === 403,
      `Got ${staffPut.status}`
    );

    // 2.4 Target user not found (404)
    const notFoundPut = await request('/api/admin/users/usr-ghost-id/role', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { role: 'staff' }
    });
    recordTest(
      '2.4 Unknown user ID returns 404 Not Found',
      notFoundPut.status === 404 && notFoundPut.data.error === 'User not found.',
      `Got ${notFoundPut.status}, ${JSON.stringify(notFoundPut.data)}`
    );

    // 2.5 Invalid role strings and malformed payloads (400)
    const invalidRoles = ['superadmin', 'guest', 'root', '', 123, null, ['admin'], {}];
    let allInvalidRejected = true;
    for (const badRole of invalidRoles) {
      const res = await request(`/api/admin/users/${customerUser.id}/role`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { role: badRole }
      });
      if (res.status !== 400 || res.data?.error !== 'Invalid role. Role must be one of: customer, staff, admin.') {
        allInvalidRejected = false;
        console.error(`Failed to reject bad role: ${JSON.stringify(badRole)} -> ${res.status}`);
      }
    }
    recordTest(
      '2.5 Rejects malformed and invalid roles with HTTP 400',
      allInvalidRejected,
      'Tested: superadmin, guest, root, empty string, number, null, array, object'
    );

    // 2.6 Self-demotion guard: Admin demoting self to customer
    const selfDemoteCust = await request(`/api/admin/users/${adminUser.id}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { role: 'customer' }
    });
    recordTest(
      '2.6 Admin self-demotion to customer rejected with 400 and exact error message',
      selfDemoteCust.status === 400 &&
        selfDemoteCust.data?.error === 'Cannot demote your own currently active administrator account.',
      `Got status ${selfDemoteCust.status}: ${JSON.stringify(selfDemoteCust.data)}`
    );

    // 2.7 Self-demotion guard: Admin demoting self to staff
    const selfDemoteStaff = await request(`/api/admin/users/${adminUser.id}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { role: 'staff' }
    });
    recordTest(
      '2.7 Admin self-demotion to staff rejected with 400 and exact error message',
      selfDemoteStaff.status === 400 &&
        selfDemoteStaff.data?.error === 'Cannot demote your own currently active administrator account.',
      `Got status ${selfDemoteStaff.status}: ${JSON.stringify(selfDemoteStaff.data)}`
    );

    // 2.8 Admin updating self to admin (allowed idempotent update)
    const selfAdmin = await request(`/api/admin/users/${adminUser.id}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { role: 'admin' }
    });
    recordTest(
      '2.8 Admin updating self to admin is permitted (200 OK)',
      selfAdmin.status === 200 && selfAdmin.data?.user?.role === 'admin',
      `Got status ${selfAdmin.status}`
    );

    console.log('\n--- SUITE 3: Dynamic Privilege Escalation & Token Verification ---');

    // 3.1 Initial verification: customer token is rejected on ticket validation
    const custValidateInitial = await request('/api/tickets/validate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { ticketCode: 'TKT-FH26-VIP-A1' }
    });
    recordTest(
      '3.1 Customer token initially rejected on POST /api/tickets/validate (403 Forbidden)',
      custValidateInitial.status === 403,
      `Expected 403, got ${custValidateInitial.status}`
    );

    // 3.2 Promote customer to staff
    const promoteRes = await request(`/api/admin/users/${customerUser.id}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { role: 'staff' }
    });
    const promoteOk =
      promoteRes.status === 200 &&
      promoteRes.data?.user?.role === 'staff' &&
      promoteRes.data?.user?.passwordHash === undefined;
    recordTest(
      '3.2 Admin promotes customer to staff (200 OK, sanitized user returned)',
      promoteOk,
      `Got status ${promoteRes.status}, user.role=${promoteRes.data?.user?.role}`
    );

    // 3.3 Verify notification generated in notifications.json
    const notifs = store.find('notifications', (n) => n.userId === customerUser.id);
    const roleNotif = notifs.find((n) => n.type === 'ROLE_UPDATED');
    recordTest(
      '3.3 ROLE_UPDATED notification created for target user',
      Boolean(roleNotif && roleNotif.message.includes('staff')),
      `Found notification: ${JSON.stringify(roleNotif)}`
    );

    // 3.4 Dynamic privilege effect: SAME customer token immediately succeeds on POST /api/tickets/validate
    const promotedTokenValidate = await request('/api/tickets/validate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { ticketCode: 'TKT-FH26-VIP-A1' }
    });
    const validateOk =
      promotedTokenValidate.status === 200 &&
      promotedTokenValidate.data?.valid === true &&
      promotedTokenValidate.data?.ticket?.status === 'CHECKED_IN';
    recordTest(
      '3.4 Promoted user token immediately succeeds on POST /api/tickets/validate (200 OK, CHECKED_IN)',
      validateOk,
      `Got status ${promotedTokenValidate.status}: ${JSON.stringify(promotedTokenValidate.data)}`
    );

    // 3.5 Demote staff back to customer
    const demoteRes = await request(`/api/admin/users/${customerUser.id}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { role: 'customer' }
    });
    const demoteOk =
      demoteRes.status === 200 &&
      demoteRes.data?.user?.role === 'customer' &&
      demoteRes.data?.user?.passwordHash === undefined;
    recordTest(
      '3.5 Demote staff back to customer (200 OK, sanitized user returned)',
      demoteOk,
      `Got status ${demoteRes.status}, user.role=${demoteRes.data?.user?.role}`
    );

    // 3.6 Dynamic revocation effect: SAME token immediately fails on POST /api/tickets/validate
    const demotedTokenValidate = await request('/api/tickets/validate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { ticketCode: 'TKT-FH26-VIP-A2' }
    });
    recordTest(
      '3.6 Demoted user token immediately rejected on POST /api/tickets/validate (403 Forbidden)',
      demotedTokenValidate.status === 403,
      `Expected 403, got ${demotedTokenValidate.status}`
    );

    console.log('\n--- SUITE 4: Stress & Edge Cases ---');

    // 4.1 Rapid role toggling
    let rapidSuccess = true;
    for (let i = 0; i < 6; i++) {
      const targetRole = i % 2 === 0 ? 'staff' : 'customer';
      const toggleRes = await request(`/api/admin/users/${customerUser.id}/role`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { role: targetRole }
      });
      if (toggleRes.status !== 200 || toggleRes.data?.user?.role !== targetRole) {
        rapidSuccess = false;
      }
    }
    recordTest(
      '4.1 Rapid sequential role toggling (staff <-> customer) succeeds with zero lock contention',
      rapidSuccess,
      'Performed 6 rapid role update cycles'
    );

    // 4.2 Concurrent requests to GET /api/admin/users
    const concurrentQueries = await Promise.all([
      request('/api/admin/users', { headers: { Authorization: `Bearer ${adminToken}` } }),
      request('/api/admin/users?role=staff', { headers: { Authorization: `Bearer ${adminToken}` } }),
      request('/api/admin/users?role=customer', { headers: { Authorization: `Bearer ${adminToken}` } }),
      request('/api/admin/users?search=admin', { headers: { Authorization: `Bearer ${adminToken}` } }),
      request('/api/admin/users?search=staff', { headers: { Authorization: `Bearer ${adminToken}` } })
    ]);
    const allConcurrent200 = concurrentQueries.every((r) => r.status === 200);
    recordTest(
      '4.2 Concurrent filtered queries to GET /api/admin/users all succeed with 200 OK',
      allConcurrent200,
      `Statuses: ${concurrentQueries.map((r) => r.status).join(', ')}`
    );

    // 4.3 Case and whitespace trimming handling on role input
    const trimmedRoleRes = await request(`/api/admin/users/${customerUser.id}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { role: '  STAFF  ' }
    });
    recordTest(
      '4.3 Handles whitespace and uppercase role inputs ("  STAFF  " -> staff)',
      trimmedRoleRes.status === 200 && trimmedRoleRes.data?.user?.role === 'staff',
      `Got status ${trimmedRoleRes.status}, role=${trimmedRoleRes.data?.user?.role}`
    );

    // 4.4 Self-demotion guard with whitespace and uppercase
    const selfDemoteUppercase = await request(`/api/admin/users/${adminUser.id}/role`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { role: '  CUSTOMER  ' }
    });
    recordTest(
      '4.4 Self-demotion guard resists whitespace and case variation ("  CUSTOMER  ")',
      selfDemoteUppercase.status === 400 &&
        selfDemoteUppercase.data?.error === 'Cannot demote your own currently active administrator account.',
      `Got status ${selfDemoteUppercase.status}`
    );

  } finally {
    // Cleanup server & timer
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  console.log('\n===============================================================');
  console.log(` RBAC Verification Finished: ${passedCount} Passed, ${failedCount} Failed`);
  console.log('===============================================================');

  return { passedCount, failedCount, results };
}

if (require.main === module) {
  runEmpiricalHarness()
    .then(({ failedCount }) => {
      // Release expiration interval
      clearInterval(expirationInterval);
      process.exit(failedCount === 0 ? 0 : 1);
    })
    .catch((err) => {
      console.error('Harness error:', err);
      clearInterval(expirationInterval);
      process.exit(1);
    });
}

module.exports = { runEmpiricalHarness };
