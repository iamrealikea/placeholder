/**
 * Adversarial Test Harness for TicketHub Auth Routes (Milestone 1)
 * Tests:
 * 1. Race conditions & Concurrency (Duplicate email, duplicate national ID)
 * 2. Input validation & malformed passwords / missing fields
 * 3. Authentication bypass (Tampered JWT, Alg None, Expired JWT, Wrong Secret, Forged Cookie)
 * 4. Privilege escalation & unauthorized field mutations via profile update
 * 5. Avatar upload security (File extensions, missing files, size limits)
 * 6. Sensitive data leakage (passwordHash sanitization)
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'tickethub-secret-key-2026';

const http = require('http');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { app, expirationInterval } = require('../server');
const { store } = require('../src/store/jsonStore');
const { generateSeedData } = require('../src/store/seed');

let server;
let BASE_URL;

const results = [];

function recordTest(suite, name, passed, details) {
  results.push({ suite, name, passed, details });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] [${suite}] ${name}: ${details || ''}`);
}

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

  const setCookie = res.headers.get('set-cookie');
  return {
    status: res.status,
    headers: res.headers,
    data,
    setCookie
  };
}

// Multipart form helper
function buildMultipart(boundary, fields, files) {
  const CRLF = '\r\n';
  let parts = [];

  for (const [key, val] of Object.entries(fields || {})) {
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}` +
      `${val}${CRLF}`
    ));
  }

  for (const file of (files || [])) {
    parts.push(Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"${CRLF}` +
      `Content-Type: ${file.contentType || 'application/octet-stream'}${CRLF}${CRLF}`
    ));
    parts.push(file.content);
    parts.push(Buffer.from(CRLF));
  }

  parts.push(Buffer.from(`--${boundary}--${CRLF}`));
  return Buffer.concat(parts);
}

async function runTests() {
  console.log('====================================================');
  console.log(' Starting Adversarial Test Harness for TicketHub Auth');
  console.log('====================================================\n');

  // Reset store with fresh seed data
  store.resetWithSeed(generateSeedData);

  // Start HTTP server on ephemeral port
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  BASE_URL = `http://127.0.0.1:${port}`;
  console.log(`Test server running on ${BASE_URL}\n`);

  // ============================================================
  // SUITE 1: Concurrency & Race Conditions
  // ============================================================
  console.log('--- SUITE 1: Concurrency & Race Conditions ---');

  // TC-1.1: Concurrent duplicate email registration
  {
    const raceEmail = `race-test-${Date.now()}@example.com`;
    const numRequests = 5;
    const promises = Array.from({ length: numRequests }, (_, i) =>
      request('/api/auth/register', {
        method: 'POST',
        body: {
          name: `Racer ${i}`,
          email: raceEmail,
          password: `Password${i}!`
        }
      })
    );

    const responses = await Promise.all(promises);
    const successCount = responses.filter((r) => r.status === 201).length;
    const conflictOrBadCount = responses.filter((r) => r.status === 400 || r.status === 409).length;

    // Check database records count
    const usersInDb = store.find('users', (u) => u.email && u.email.toLowerCase() === raceEmail.toLowerCase());

    const passed = successCount === 1 && usersInDb.length === 1;
    recordTest(
      'Concurrency',
      'TC-1.1: Concurrent duplicate email registration race condition',
      passed,
      `Out of ${numRequests} concurrent requests: ${successCount} returned 201, ${conflictOrBadCount} rejected. Users in DB: ${usersInDb.length}. Statuses: [${responses.map(r => r.status).join(', ')}]`
    );
  }

  // TC-1.2: Concurrent duplicate National ID registration
  {
    const raceNid = `NID-${Date.now()}`;
    const numRequests = 5;
    const promises = Array.from({ length: numRequests }, (_, i) =>
      request('/api/auth/register', {
        method: 'POST',
        body: {
          name: `NID Racer ${i}`,
          email: `nid-race-${i}-${Date.now()}@example.com`,
          password: `Password${i}!`,
          nationalId: raceNid
        }
      })
    );

    const responses = await Promise.all(promises);
    const successCount = responses.filter((r) => r.status === 201).length;
    const usersInDb = store.find('users', (u) => u.nationalId === raceNid);

    const passed = successCount === 1 && usersInDb.length === 1;
    recordTest(
      'Concurrency',
      'TC-1.2: Concurrent duplicate National ID registration race condition',
      passed,
      `Out of ${numRequests} concurrent requests: ${successCount} returned 201. Users in DB: ${usersInDb.length}. Statuses: [${responses.map(r => r.status).join(', ')}]`
    );
  }

  // TC-1.3: Sequential duplicate email registration
  {
    const seqEmail = `seq-test-${Date.now()}@example.com`;
    const reg1 = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Seq User', email: seqEmail, password: 'Password123!' }
    });
    const reg2 = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Seq User 2', email: seqEmail, password: 'Password123!' }
    });

    const passed = reg1.status === 201 && (reg2.status === 400 || reg2.status === 409);
    recordTest(
      'Concurrency',
      'TC-1.3: Sequential duplicate email registration rejected',
      passed,
      `Reg1 status: ${reg1.status}, Reg2 status: ${reg2.status} (body: ${JSON.stringify(reg2.data)})`
    );
  }

  // TC-1.4: Sequential duplicate National ID registration
  {
    const seqNid = `NID-SEQ-${Date.now()}`;
    const reg1 = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'NID User 1', email: `nid1-${Date.now()}@example.com`, password: 'Password123!', nationalId: seqNid }
    });
    const reg2 = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'NID User 2', email: `nid2-${Date.now()}@example.com`, password: 'Password123!', nationalId: seqNid }
    });

    const passed = reg1.status === 201 && reg2.status === 409;
    recordTest(
      'Concurrency',
      'TC-1.4: Sequential duplicate National ID returns 409 Conflict',
      passed,
      `Reg1 status: ${reg1.status}, Reg2 status: ${reg2.status} (body: ${JSON.stringify(reg2.data)})`
    );
  }

  // ============================================================
  // SUITE 2: Input Validation & Malformed Payloads
  // ============================================================
  console.log('\n--- SUITE 2: Input Validation & Malformed Payloads ---');

  // TC-2.1: Missing name on /register
  {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: { email: `missing-name-${Date.now()}@example.com`, password: 'Password123!' }
    });
    recordTest('Validation', 'TC-2.1: Missing name on /register returns 400', res.status === 400, `Status: ${res.status}`);
  }

  // TC-2.2: Missing email on /register
  {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'No Email User', password: 'Password123!' }
    });
    recordTest('Validation', 'TC-2.2: Missing email on /register returns 400', res.status === 400, `Status: ${res.status}`);
  }

  // TC-2.3: Missing password on /register
  {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'No Password User', email: `no-pwd-${Date.now()}@example.com` }
    });
    recordTest('Validation', 'TC-2.3: Missing password on /register returns 400', res.status === 400, `Status: ${res.status}`);
  }

  // TC-2.4: Empty JSON body on /register
  {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: {}
    });
    recordTest('Validation', 'TC-2.4: Empty JSON body on /register returns 400', res.status === 400, `Status: ${res.status}`);
  }

  // TC-2.5: Malformed password types (number, null, object, array)
  {
    // number password
    const resNum = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Num Pwd', email: `num-pwd-${Date.now()}@example.com`, password: 12345678 }
    });
    // bcryptjs might hash String(12345678) or fail
    const numPassed = resNum.status === 201 || resNum.status === 400;
    recordTest('Validation', 'TC-2.5a: Numeric password handling (graceful, no unhandled 500)', numPassed, `Status: ${resNum.status}`);

    // null password
    const resNull = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Null Pwd', email: `null-pwd-${Date.now()}@example.com`, password: null }
    });
    recordTest('Validation', 'TC-2.5b: Null password returns 400', resNull.status === 400, `Status: ${resNull.status}`);

    // object password (injection attempt)
    const resObj = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Obj Pwd', email: `obj-pwd-${Date.now()}@example.com`, password: { $gt: '' } }
    });
    const objHandled = resObj.status === 400 || (resObj.status !== 500);
    recordTest('Validation', 'TC-2.5c: Object password (injection) rejected with 400 (not 500)', resObj.status === 400, `Status: ${resObj.status}`);

    // array password
    const resArr = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Arr Pwd', email: `arr-pwd-${Date.now()}@example.com`, password: ['pass1', 'pass2'] }
    });
    recordTest('Validation', 'TC-2.5d: Array password rejected with 400 (not 500)', resArr.status === 400, `Status: ${resArr.status}`);
  }

  // TC-2.6: Missing fields on POST /login
  {
    const resEmpty = await request('/api/auth/login', { method: 'POST', body: {} });
    recordTest('Validation', 'TC-2.6a: Empty body on /login returns 400', resEmpty.status === 400, `Status: ${resEmpty.status}`);

    const resNoPwd = await request('/api/auth/login', { method: 'POST', body: { email: 'user@example.com' } });
    recordTest('Validation', 'TC-2.6b: Missing password on /login returns 400', resNoPwd.status === 400, `Status: ${resNoPwd.status}`);

    const resNoEmail = await request('/api/auth/login', { method: 'POST', body: { password: 'secret' } });
    recordTest('Validation', 'TC-2.6c: Missing email on /login returns 400', resNoEmail.status === 400, `Status: ${resNoEmail.status}`);

    const resBadUser = await request('/api/auth/login', { method: 'POST', body: { email: 'nonexistent@example.com', password: 'secret' } });
    recordTest('Validation', 'TC-2.6d: Non-existent email on /login returns 401', resBadUser.status === 401, `Status: ${resBadUser.status}`);
  }

  // TC-2.7: Missing / invalid provider on /social-login
  {
    const resNoProv = await request('/api/auth/social-login', { method: 'POST', body: {} });
    recordTest('Validation', 'TC-2.7a: Empty body on /social-login returns 400', resNoProv.status === 400, `Status: ${resNoProv.status}`);

    const resInvalidProv = await request('/api/auth/social-login', { method: 'POST', body: { provider: 'twitter', email: 'foo@twitter.com' } });
    recordTest('Validation', 'TC-2.7b: Unsupported provider on /social-login returns 400', resInvalidProv.status === 400, `Status: ${resInvalidProv.status}`);
  }

  // ============================================================
  // SUITE 3: Authentication Bypass & Token Security
  // ============================================================
  console.log('\n--- SUITE 3: Authentication Bypass & Token Security ---');

  // First create a legitimate registered user for auth testing
  const validEmail = `legit-${Date.now()}@example.com`;
  const validPassword = 'CorrectPassword123!';
  const regUser = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Legit User', email: validEmail, password: validPassword }
  });
  const validToken = regUser.data.token;
  const validUserId = regUser.data.user.id;

  // TC-3.1: Unauthenticated access to /api/auth/me
  {
    const res = await request('/api/auth/me');
    recordTest('AuthBypass', 'TC-3.1: Unauthenticated GET /api/auth/me returns 401', res.status === 401, `Status: ${res.status}`);
  }

  // TC-3.2: Unauthenticated access to /api/auth/profile
  {
    const res = await request('/api/auth/profile');
    recordTest('AuthBypass', 'TC-3.2: Unauthenticated GET /api/auth/profile returns 401', res.status === 401, `Status: ${res.status}`);
  }

  // TC-3.3: Unauthenticated PUT /api/auth/profile
  {
    const res = await request('/api/auth/profile', { method: 'PUT', body: { name: 'Hacker' } });
    recordTest('AuthBypass', 'TC-3.3: Unauthenticated PUT /api/auth/profile returns 401', res.status === 401, `Status: ${res.status}`);
  }

  // TC-3.4: Unauthenticated POST /api/auth/avatar
  {
    const res = await request('/api/auth/avatar', { method: 'POST', body: { avatarUrl: '/uploads/hacked.png' } });
    recordTest('AuthBypass', 'TC-3.4: Unauthenticated POST /api/auth/avatar returns 401', res.status === 401, `Status: ${res.status}`);
  }

  // TC-3.5: JWT Tampering - Modified signature / payload
  {
    const parts = validToken.split('.');
    // Tamper payload to claim admin role
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    payload.role = 'admin';
    const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const forgedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const res = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${forgedToken}` }
    });
    recordTest('AuthBypass', 'TC-3.5: Tampered JWT payload signature mismatch rejected with 401', res.status === 401, `Status: ${res.status}`);
  }

  // TC-3.6: JWT Alg None Attack
  {
    const headerNone = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payloadNone = Buffer.from(JSON.stringify({ id: validUserId, email: validEmail, role: 'admin' })).toString('base64url');
    const noneToken = `${headerNone}.${payloadNone}.`;

    const res = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${noneToken}` }
    });
    recordTest('AuthBypass', 'TC-3.6: JWT alg:none vulnerability rejected with 401', res.status === 401, `Status: ${res.status}`);
  }

  // TC-3.7: JWT signed with wrong secret
  {
    const evilToken = jwt.sign({ id: validUserId, email: validEmail, role: 'admin' }, 'wrong-secret-key-12345');
    const res = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${evilToken}` }
    });
    recordTest('AuthBypass', 'TC-3.7: JWT signed with wrong secret rejected with 401', res.status === 401, `Status: ${res.status}`);
  }

  // TC-3.8: Expired JWT token
  {
    const expiredToken = jwt.sign(
      { id: validUserId, email: validEmail, role: 'customer' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    recordTest('AuthBypass', 'TC-3.8: Expired JWT token rejected with 401', res.status === 401, `Status: ${res.status}`);
  }

  // TC-3.9: Validly signed token for non-existent user
  {
    const phantomToken = jwt.sign(
      { id: 'usr-nonexistent-9999', email: 'phantom@tickethub.test', role: 'customer' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${phantomToken}` }
    });
    recordTest('AuthBypass', 'TC-3.9: Token for deleted/non-existent user rejected with 401', res.status === 401, `Status: ${res.status}`);
  }

  // TC-3.10: Forged Cookie
  {
    const res = await request('/api/auth/me', {
      headers: { Cookie: 'tickethub_token=fake_random_junk_token_value' }
    });
    recordTest('AuthBypass', 'TC-3.10: Forged/garbage cookie rejected with 401', res.status === 401, `Status: ${res.status}`);
  }

  // TC-3.11: Valid Cookie Authentication
  {
    const res = await request('/api/auth/me', {
      headers: { Cookie: `tickethub_token=${validToken}` }
    });
    recordTest('AuthBypass', 'TC-3.11: Valid cookie authenticates successfully with 200', res.status === 200 && res.data?.user?.id === validUserId, `Status: ${res.status}`);
  }

  // ============================================================
  // SUITE 4: Privilege Escalation & State Tampering
  // ============================================================
  console.log('\n--- SUITE 4: Privilege Escalation & State Tampering ---');

  // TC-4.1: Attempt role escalation via PUT /profile
  {
    const res = await request('/api/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${validToken}` },
      body: { role: 'admin' }
    });
    const userInDb = store.findById('users', validUserId);
    const passed = res.status === 200 && userInDb.role === 'customer' && res.data.user.role === 'customer';
    recordTest(
      'PrivilegeEscalation',
      'TC-4.1: Role escalation attempt via PUT /profile is blocked',
      passed,
      `Returned role: ${res.data?.user?.role}, DB role: ${userInDb?.role}`
    );
  }

  // TC-4.2: Attempt points tampering via PUT /profile
  {
    const initialPoints = store.findById('users', validUserId).points;
    const res = await request('/api/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${validToken}` },
      body: { points: 999999 }
    });
    const userInDb = store.findById('users', validUserId);
    const passed = res.status === 200 && userInDb.points === initialPoints;
    recordTest(
      'PrivilegeEscalation',
      'TC-4.2: Points tampering via PUT /profile is blocked',
      passed,
      `Initial points: ${initialPoints}, DB points: ${userInDb?.points}`
    );
  }

  // TC-4.3: Attempt ID mutation via PUT /profile
  {
    const res = await request('/api/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${validToken}` },
      body: { id: 'usr-admin-takeover' }
    });
    const userInDb = store.findById('users', validUserId);
    const passed = res.status === 200 && userInDb.id === validUserId;
    recordTest(
      'PrivilegeEscalation',
      'TC-4.3: User ID mutation via PUT /profile is blocked',
      passed,
      `DB ID: ${userInDb?.id}`
    );
  }

  // TC-4.4: Attempt passwordHash tampering via PUT /profile
  {
    const originalHash = store.findById('users', validUserId).passwordHash;
    const res = await request('/api/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${validToken}` },
      body: { passwordHash: 'injected_hash', password: 'new_password' }
    });
    const userInDb = store.findById('users', validUserId);
    const passed = res.status === 200 && userInDb.passwordHash === originalHash;
    recordTest(
      'PrivilegeEscalation',
      'TC-4.4: Password/passwordHash mutation via PUT /profile is blocked',
      passed,
      `Hash remained intact: ${passed}`
    );
  }

  // TC-4.5: Prototype pollution attempt via PUT /profile
  {
    const payload = JSON.parse('{"__proto__": {"polluted": true}}');
    await request('/api/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${validToken}` },
      body: payload
    });
    const polluted = ({}).polluted === true;
    recordTest(
      'PrivilegeEscalation',
      'TC-4.5: Prototype pollution attempt via PUT /profile has no global effect',
      !polluted,
      `Object.prototype.polluted: ${({}).polluted}`
    );
  }

  // ============================================================
  // SUITE 5: Avatar Upload Security
  // ============================================================
  console.log('\n--- SUITE 5: Avatar Upload Security ---');

  // TC-5.1: Missing file and missing URL
  {
    const res = await request('/api/auth/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${validToken}` },
      body: {}
    });
    recordTest('AvatarUpload', 'TC-5.1: Avatar upload with no file and no body returns 400', res.status === 400, `Status: ${res.status}`);
  }

  // TC-5.2: Direct avatarUrl assignment (sanitized)
  {
    const res = await request('/api/auth/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${validToken}` },
      body: { avatarUrl: '/uploads/custom-avatar.png' }
    });
    const passed = res.status === 200 && res.data.avatarUrl === '/uploads/custom-avatar.png';
    recordTest('AvatarUpload', 'TC-5.2: Avatar update via JSON body succeeds with 200', passed, `Status: ${res.status}`);
  }

  // TC-5.3: Dangerous file extension upload (.php / .js / .html)
  {
    const boundary = '----AdversarialBoundary' + Date.now();
    const maliciousFile = {
      fieldname: 'avatar',
      filename: '../../../evil.html',
      contentType: 'text/html',
      content: Buffer.from('<script>alert("XSS")</script>')
    };
    const multipartBody = buildMultipart(boundary, {}, [maliciousFile]);

    const res = await request('/api/auth/avatar', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: multipartBody
    });

    // Check if filename was sanitized and didn't traverse
    let safeFilename = false;
    if (res.status === 200 && res.data && res.data.avatarUrl) {
      const savedPath = res.data.avatarUrl;
      // It should NOT contain evil.html, and should end in .png (fallback)
      safeFilename = !savedPath.includes('..') && savedPath.endsWith('.png') && savedPath.startsWith('/uploads/avatar-');
    }
    recordTest(
      'AvatarUpload',
      'TC-5.3: Path traversal and dangerous extension neutralized to safe /uploads/avatar-*.png',
      safeFilename,
      `AvatarUrl assigned: ${res.data?.avatarUrl}`
    );
  }

  // TC-5.4: File size limit (>5MB)
  {
    const boundary = '----SizeTestBoundary' + Date.now();
    // 5.5 MB payload
    const largeContent = Buffer.alloc(5.5 * 1024 * 1024, 'a');
    const largeFile = {
      fieldname: 'avatar',
      filename: 'huge.png',
      contentType: 'image/png',
      content: largeContent
    };
    const multipartBody = buildMultipart(boundary, {}, [largeFile]);

    const res = await request('/api/auth/avatar', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: multipartBody
    });

    const passed = res.status === 400;
    recordTest('AvatarUpload', 'TC-5.4: Files exceeding 5MB rejected with 400 Bad Request', passed, `Status: ${res.status} (body: ${JSON.stringify(res.data)})`);
  }

  // ============================================================
  // SUITE 6: Sensitive Data Leakage
  // ============================================================
  console.log('\n--- SUITE 6: Sensitive Data Leakage ---');

  // TC-6.1: Registration response does not contain passwordHash
  {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Leak Check Reg', email: `leak-reg-${Date.now()}@example.com`, password: 'MySecretPassword123!' }
    });
    const leak = res.data?.user?.passwordHash !== undefined;
    recordTest('DataLeakage', 'TC-6.1: POST /register does NOT leak passwordHash', !leak, `passwordHash present: ${leak}`);
  }

  // TC-6.2: Login response does not contain passwordHash
  {
    const testEmail = `leak-login-${Date.now()}@example.com`;
    await request('/api/auth/register', {
      method: 'POST',
      body: { name: 'Leak Check Login', email: testEmail, password: 'MySecretPassword123!' }
    });
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { email: testEmail, password: 'MySecretPassword123!' }
    });
    const leak = res.data?.user?.passwordHash !== undefined;
    recordTest('DataLeakage', 'TC-6.2: POST /login does NOT leak passwordHash', !leak, `passwordHash present: ${leak}`);
  }

  // TC-6.3: Social login does not contain passwordHash
  {
    const res = await request('/api/auth/social-login', {
      method: 'POST',
      body: { provider: 'gmail', email: `leak-social-${Date.now()}@gmail.com`, name: 'Social User' }
    });
    const leak = res.data?.user?.passwordHash !== undefined;
    recordTest('DataLeakage', 'TC-6.3: POST /social-login does NOT leak passwordHash', !leak, `passwordHash present: ${leak}`);
  }

  // TC-6.4: GET /me does not leak passwordHash
  {
    const res = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    const leak = res.data?.user?.passwordHash !== undefined;
    recordTest('DataLeakage', 'TC-6.4: GET /api/auth/me does NOT leak passwordHash', !leak, `passwordHash present: ${leak}`);
  }

  // TC-6.5: GET /profile does not leak passwordHash
  {
    const res = await request('/api/auth/profile', {
      headers: { Authorization: `Bearer ${validToken}` }
    });
    const leak = res.data?.user?.passwordHash !== undefined;
    recordTest('DataLeakage', 'TC-6.5: GET /api/auth/profile does NOT leak passwordHash', !leak, `passwordHash present: ${leak}`);
  }

  // TC-6.6: PUT /profile does not leak passwordHash
  {
    const res = await request('/api/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${validToken}` },
      body: { name: 'New Sanitized Name' }
    });
    const leak = res.data?.user?.passwordHash !== undefined;
    recordTest('DataLeakage', 'TC-6.6: PUT /api/auth/profile does NOT leak passwordHash', !leak, `passwordHash present: ${leak}`);
  }

  // Clean up
  clearInterval(expirationInterval);
  await new Promise((resolve) => server.close(resolve));

  console.log('\n====================================================');
  console.log(' Adversarial Test Suite Completed');
  console.log('====================================================');
  const total = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = total - passedCount;
  console.log(`Total Tests: ${total} | Passed: ${passedCount} | Failed: ${failedCount}\n`);

  // Write JSON output for record
  fs.writeFileSync(
    path.join(__dirname, 'adversarial-results.json'),
    JSON.stringify({ total, passedCount, failedCount, results }, null, 2),
    'utf8'
  );

  return { total, passedCount, failedCount, results };
}

runTests().then(({ failedCount }) => {
  process.exit(failedCount > 0 ? 1 : 0);
}).catch((err) => {
  console.error('Test execution fatal error:', err);
  process.exit(2);
});
