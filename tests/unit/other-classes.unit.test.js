const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-other-unit-'));
process.env.DATA_DIR = tmpDataDir;
process.env.NODE_ENV = 'test';

const { store } = require('../../src/store/jsonStore');
const { generateSeedData } = require('../../src/store/seed');
const seatTemplates = require('../../src/store/seatTemplates');
const paymentGateway = require('../../src/services/paymentGateway');
const socialAuth = require('../../src/services/socialAuth');
const auth = require('../../src/middleware/auth');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

describe('Other Classes & Modules Unit Tests', () => {
  before(() => {
    store.resetWithSeed(generateSeedData);
  });

  after(() => {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  });

  // UT-OC-01
  it('UT-OC-01: JsonStore CRUD operations insert, query, update, and remove items reliably', () => {
    const inserted = store.insert('categories', { id: 'cat-x', name: 'XTest' });
    assert.equal(store.findById('categories', 'cat-x')?.name, 'XTest');

    const many = store.insertMany('categories', [
      { id: 'cat-y', name: 'YTest' },
      { id: 'cat-z', name: 'ZTest' }
    ]);
    assert.equal(many.length, 2);
    assert.ok(store.find('categories', (c) => c.name.endsWith('Test')).length >= 3);
    assert.equal(store.findOne('categories', (c) => c.name === 'YTest')?.id, 'cat-y');

    assert.equal(store.update('categories', 'cat-x', { name: 'XUpdated' })?.name, 'XUpdated');
    assert.equal(store.update('categories', 'cat-missing', { name: 'None' }), null);

    assert.equal(store.remove('categories', 'cat-x'), true);
    assert.equal(store.remove('categories', 'cat-x'), false);

    const removedCount = store.removeWhere('categories', (c) => c.id === 'cat-y' || c.id === 'cat-z');
    assert.equal(removedCount, 2);
  });

  // UT-OC-02
  it('UT-OC-02: JsonStore createBackup, listBackups, restoreBackup snapshot and restore state', () => {
    const beforeCount = store.getAll('categories').length;
    const backup = store.createBackup('unit-test');
    assert.ok(backup.backupId.includes('unit-test'));
    assert.ok(store.listBackups().some((b) => b.backupId === backup.backupId));

    store.insert('categories', { id: 'cat-temp', name: 'Temporary' });
    assert.equal(store.getAll('categories').length, beforeCount + 1);

    const restored = store.restoreBackup(backup.backupId);
    assert.equal(restored.restoredFrom, backup.backupId);
    assert.equal(store.getAll('categories').length, beforeCount);

    assert.throws(() => store.restoreBackup('non-existent.json'), /Backup file not found/);
  });

  // UT-OC-03
  it('UT-OC-03: seatTemplates returns concert-arena, theater-hall, seminar-classroom and deep-clones results', () => {
    const all = seatTemplates.getAllTemplates();
    assert.equal(all.length, 3);

    const arena = seatTemplates.getTemplate(' CONCERT-ARENA ');
    const hall = seatTemplates.getTemplate('theater-hall');
    const seminar = seatTemplates.getTemplate('seminar-classroom');
    assert.equal(arena.zones.length, 3);
    assert.equal(hall.zones.length, 2);
    assert.equal(seminar.zones.length, 2);

    arena.name = 'Mutated Locally';
    assert.equal(seatTemplates.getTemplate('concert-arena').name, 'Concert Arena');
    assert.equal(seatTemplates.getTemplate('unknown-venue'), null);
    assert.equal(seatTemplates.getTemplate(''), null);
  });

  // UT-OC-04
  it('UT-OC-04: paymentGateway.processPayment succeeds for PROMPTPAY, valid CREDIT_CARD, and valid TRUEMONEY', () => {
    assert.equal(paymentGateway.VALID_METHODS.length, 6);

    const p1 = paymentGateway.processPayment({
      bookingId: 'bkg-gw-1',
      userId: 'usr-customer-1',
      method: 'PROMPTPAY',
      amount: 1540
    });
    assert.equal(p1.status, 'SUCCESS');

    const p2 = paymentGateway.processPayment({
      bookingId: 'bkg-gw-2',
      userId: 'usr-customer-1',
      method: 'CREDIT_CARD',
      amount: 3080,
      paymentDetails: {
        cardNumber: '4242 4242 4242 4242',
        expiry: '12/28',
        cvv: '123',
        cardHolder: 'Chanita Chansamrong'
      }
    });
    assert.equal(p2.method, 'CREDIT_CARD');

    const p3 = paymentGateway.processPayment({
      bookingId: 'bkg-gw-3',
      userId: 'usr-customer-1',
      method: 'TRUEMONEY',
      amount: 1540,
      paymentDetails: { phone: '081-234-5678' }
    });
    assert.equal(p3.method, 'TRUEMONEY');
  });

  // UT-OC-05
  it('UT-OC-05: paymentGateway.processPayment throws 400 errors on invalid method, simulated failure, or malformed details', () => {
    const cases = [
      [{ method: 'BITCOIN', amount: 100 }, /Invalid payment method/],
      [{ method: 'PROMPTPAY', amount: 100, paymentDetails: { simulateFailure: true } }, /declined/],
      [{ method: 'CREDIT_CARD', amount: 100, paymentDetails: { cardNumber: '123' } }, /Invalid card number/],
      [{ method: 'DEBIT_CARD', amount: 100, paymentDetails: { expiry: '13/28' } }, /Invalid card expiry/],
      [{ method: 'CREDIT_CARD', amount: 100, paymentDetails: { cvv: '12' } }, /Invalid security code/],
      [{ method: 'CREDIT_CARD', amount: 100, paymentDetails: { cardHolder: '   ' } }, /Cardholder name is required/],
      [{ method: 'KBANK', amount: 100, paymentDetails: { phone: 'abc' } }, /Invalid registered phone/]
    ];
    for (const [args, regex] of cases) {
      assert.throws(
        () => paymentGateway.processPayment({ bookingId: 'bkg-err', userId: 'usr-customer-1', ...args }),
        (err) => err.status === 400 && regex.test(err.message)
      );
    }
  });

  // UT-OC-06
  it('UT-OC-06: auth.sanitizeUser strips passwordHash and signToken issues verifiable JWTs', () => {
    assert.equal(auth.sanitizeUser(null), null);
    const safe = auth.sanitizeUser({ id: 'u1', email: 'a@b.com', passwordHash: 'secret-hash', role: 'customer' });
    assert.equal(safe.passwordHash, undefined);
    assert.equal(safe.email, 'a@b.com');

    const token = auth.signToken({ id: 'u1', email: 'a@b.com', role: 'customer', name: 'Test' });
    const decoded = jwt.verify(token, auth.JWT_SECRET);
    assert.equal(decoded.id, 'u1');
    assert.equal(decoded.role, 'customer');
  });

  // UT-OC-07
  it('UT-OC-07: auth.optionalAuth populates req.user for Bearer/cookie tokens and yields null on missing/invalid tokens', () => {
    const user = store.findById('users', 'usr-customer-1');
    const token = auth.signToken(user);

    const reqBearer = { headers: { authorization: `Bearer ${token}` }, cookies: {} };
    let nextCalled = false;
    auth.optionalAuth(reqBearer, mockRes(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(reqBearer.user.id, user.id);

    const reqCookie = { headers: {}, cookies: { tickethub_token: token } };
    auth.optionalAuth(reqCookie, mockRes(), () => {});
    assert.equal(reqCookie.user.id, user.id);

    const reqBad = { headers: { authorization: 'Bearer invalid.jwt.token' }, cookies: {} };
    auth.optionalAuth(reqBad, mockRes(), () => {});
    assert.equal(reqBad.user, null);

    const reqNone = { headers: {}, cookies: {} };
    auth.optionalAuth(reqNone, mockRes(), () => {});
    assert.equal(reqNone.user, null);
  });

  // UT-OC-08
  it('UT-OC-08: auth.requireAuth rejects missing, invalid, or deleted-user tokens with 401 and allows valid user', () => {
    const resMissing = mockRes();
    auth.requireAuth({ headers: {}, cookies: {} }, resMissing, () => assert.fail('should not call next'));
    assert.equal(resMissing.statusCode, 401);

    const resInvalid = mockRes();
    auth.requireAuth({ headers: { authorization: 'Bearer bad.token' }, cookies: {} }, resInvalid, () => assert.fail('should not call next'));
    assert.equal(resInvalid.statusCode, 401);

    const ghostToken = auth.signToken({ id: 'usr-ghost', email: 'g@t.com', role: 'customer', name: 'Ghost' });
    const resGhost = mockRes();
    auth.requireAuth({ headers: { authorization: `Bearer ${ghostToken}` }, cookies: {} }, resGhost, () => assert.fail('should not call next'));
    assert.equal(resGhost.statusCode, 401);

    const realUser = store.findById('users', 'usr-customer-1');
    const validReq = { headers: { authorization: `Bearer ${auth.signToken(realUser)}` }, cookies: {} };
    let passed = false;
    auth.requireAuth(validReq, mockRes(), () => { passed = true; });
    assert.equal(passed, true);
    assert.equal(validReq.user.id, realUser.id);
  });

  // UT-OC-09
  it('UT-OC-09: auth.requireRole enforces RBAC with 403 for wrong role and passes for authorized role', () => {
    const customer = store.findById('users', 'usr-customer-1');
    const admin = store.findById('users', 'usr-admin-1');
    const adminOnly = auth.requireRole(['admin']);

    const resForbidden = mockRes();
    adminOnly(
      { headers: { authorization: `Bearer ${auth.signToken(customer)}` }, cookies: {} },
      resForbidden,
      () => assert.fail('customer should be rejected')
    );
    assert.equal(resForbidden.statusCode, 403);

    let allowed = false;
    adminOnly(
      { headers: { authorization: `Bearer ${auth.signToken(admin)}` }, cookies: {} },
      mockRes(),
      () => { allowed = true; }
    );
    assert.equal(allowed, true);
  });

  // UT-OC-10
  it('UT-OC-10: socialAuth.getPublicConfig & isPhoneDemoEnabled reflect environment configuration safely', () => {
    const prevEnv = {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
      FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
      NODE_ENV: process.env.NODE_ENV,
      ALLOW_SIMULATED_PHONE_LOGIN: process.env.ALLOW_SIMULATED_PHONE_LOGIN
    };

    try {
      process.env.GOOGLE_CLIENT_ID = 'google-client-123';
      process.env.FACEBOOK_APP_ID = 'fb-app-1';
      process.env.FACEBOOK_APP_SECRET = 'fb-secret-1';
      process.env.NODE_ENV = 'test';

      const cfg = socialAuth.getPublicConfig();
      assert.deepEqual(cfg.google, { enabled: true, clientId: 'google-client-123' });
      assert.deepEqual(cfg.facebook, { enabled: true, appId: 'fb-app-1' });
      assert.equal(cfg.phoneDemo, true);

      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_SIMULATED_PHONE_LOGIN;
      assert.equal(socialAuth.isPhoneDemoEnabled(), false);

      process.env.ALLOW_SIMULATED_PHONE_LOGIN = 'true';
      assert.equal(socialAuth.isPhoneDemoEnabled(), true);
    } finally {
      for (const [k, v] of Object.entries(prevEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  // UT-OC-11
  it('UT-OC-11: socialAuth.verifyProviderToken rejects unsupported providers (400) and unconfigured providers (503)', async () => {
    const prevG = process.env.GOOGLE_CLIENT_ID;
    const prevFId = process.env.FACEBOOK_APP_ID;
    const prevFSec = process.env.FACEBOOK_APP_SECRET;
    try {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.FACEBOOK_APP_ID;
      delete process.env.FACEBOOK_APP_SECRET;

      await assert.rejects(
        () => socialAuth.verifyProviderToken('line', 'tok'),
        (err) => err instanceof socialAuth.SocialAuthError && err.status === 400
      );
      await assert.rejects(
        () => socialAuth.verifyProviderToken('gmail', 'tok'),
        (err) => err instanceof socialAuth.SocialAuthError && err.status === 503
      );
      await assert.rejects(
        () => socialAuth.verifyProviderToken('facebook', 'tok'),
        (err) => err instanceof socialAuth.SocialAuthError && err.status === 503
      );
    } finally {
      if (prevG === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = prevG;
      if (prevFId === undefined) delete process.env.FACEBOOK_APP_ID; else process.env.FACEBOOK_APP_ID = prevFId;
      if (prevFSec === undefined) delete process.env.FACEBOOK_APP_SECRET; else process.env.FACEBOOK_APP_SECRET = prevFSec;
    }
  });

  // UT-OC-12
  it('UT-OC-12: socialAuth verifies Google/Facebook tokens with mocked provider API and rejects bad aud/expiry', async () => {
    const origFetch = global.fetch;
    const prevG = process.env.GOOGLE_CLIENT_ID;
    const prevFId = process.env.FACEBOOK_APP_ID;
    const prevFSec = process.env.FACEBOOK_APP_SECRET;

    try {
      process.env.GOOGLE_CLIENT_ID = 'my-client-id';
      process.env.FACEBOOK_APP_ID = 'fb-id';
      process.env.FACEBOOK_APP_SECRET = 'fb-sec';

      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      global.fetch = async (url) => {
        if (String(url).includes('oauth2.googleapis.com')) {
          if (String(url).includes('good-tok')) {
            return {
              ok: true,
              json: async () => ({
                sub: 'g-sub-1',
                aud: 'my-client-id',
                iss: 'https://accounts.google.com',
                exp: String(futureExp),
                email: 'User@Gmail.com',
                email_verified: 'true',
                name: 'Social User',
                picture: 'https://example.com/p.jpg'
              })
            };
          }
          return {
            ok: true,
            json: async () => ({
              sub: 'g-sub-2',
              aud: 'wrong-client',
              iss: 'https://accounts.google.com',
              exp: String(futureExp)
            })
          };
        }
        if (String(url).includes('debug_token')) {
          return {
            ok: true,
            json: async () => ({
              data: { is_valid: true, app_id: 'fb-id', user_id: 'fb-u1', expires_at: futureExp }
            })
          };
        }
        return {
          ok: true,
          json: async () => ({
            id: 'fb-u1',
            name: 'FB User',
            email: 'fb@example.com',
            picture: { data: { url: 'http://insecure.example.com/a.jpg' } }
          })
        };
      };

      const gProfile = await socialAuth.verifyGoogleIdToken('good-tok');
      assert.equal(gProfile.provider, 'gmail');
      assert.equal(gProfile.providerId, 'g-sub-1');
      assert.equal(gProfile.email, 'user@gmail.com');
      assert.equal(gProfile.emailVerified, true);
      assert.equal(gProfile.avatarUrl, 'https://example.com/p.jpg');

      await assert.rejects(
        () => socialAuth.verifyGoogleIdToken('bad-aud-tok'),
        (err) => err instanceof socialAuth.SocialAuthError && err.status === 401
      );

      const fbProfile = await socialAuth.verifyFacebookAccessToken('fb-tok');
      assert.equal(fbProfile.provider, 'facebook');
      assert.equal(fbProfile.providerId, 'fb-u1');
      assert.equal(fbProfile.avatarUrl, '');
    } finally {
      global.fetch = origFetch;
      if (prevG === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = prevG;
      if (prevFId === undefined) delete process.env.FACEBOOK_APP_ID; else process.env.FACEBOOK_APP_ID = prevFId;
      if (prevFSec === undefined) delete process.env.FACEBOOK_APP_SECRET; else process.env.FACEBOOK_APP_SECRET = prevFSec;
    }
  });
});
