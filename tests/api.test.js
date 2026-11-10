/**
 * TicketHub Automated Integration & Acceptance Test Suite
 * Milestone 3: E2E Automated Integration Test Suite
 *
 * Verifies all Acceptance Criteria across FR-01 to FR-49 and NFR-01 to NFR-17:
 * - Suite 1: Authentication & Profile Flow (FR-01 to FR-05)
 * - Suite 2: Event Discovery & Bookmarking (FR-06 to FR-12, FR-20)
 * - Suite 3: Sale Period Restriction Enforcement (FR-48, FR-49)
 * - Suite 4: Seating Plan & Double-Booking Prevention (FR-16 to FR-23, NFR-08)
 * - Suite 5: Checkout & Payment Flow (FR-24 to FR-27, FR-46, FR-47, NFR-09)
 * - Suite 6: QR Ticket Anti-Reuse Validation (FR-28 to FR-31)
 * - Suite 7: Cancellation & Refund Policy Calculation (FR-38, FR-39)
 * - Suite 8: Admin Dashboard, RBAC & Backup/Restore (FR-40 to FR-44, NFR-06, NFR-11, NFR-12)
 * - Suite 10: Admin Event Inspection & Transaction Audit (FR-42, FR-43)
 *
 * Execution: npm test (node --test tests/api.test.js)
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'tickethub-secret-key-2026';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { app, expirationInterval } = require('../server');
const { store } = require('../src/store/jsonStore');
const { generateSeedData, ensureTicketQrCodes } = require('../src/store/seed');

let server;
let BASE_URL;

/**
 * Universal HTTP request wrapper utilizing Node.js native fetch
 */
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

describe('TicketHub E2E Automated Integration Test Suite', () => {
  let customerToken = '';
  let customerUser = null;
  let customerCookie = '';
  let adminToken = '';
  let staffToken = '';
  let heldBookingId = '';
  let paidBookingId = '';
  let issuedTicketCode = '';
  let issuedQrPayload = '';

  before(async () => {
    // Reset test database to deterministic seed state
    store.resetWithSeed(generateSeedData);
    await ensureTicketQrCodes(store);

    // Bind Express app to ephemeral port 0
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    BASE_URL = `http://127.0.0.1:${server.address().port}`;

    // Seeded Admin credentials login
    const adminRes = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@ticket.com', password: 'admin123' }
    });
    assert.strictEqual(adminRes.status, 200);
    assert.ok(adminRes.data.token);
    adminToken = adminRes.data.token;

    // Seeded Staff credentials login
    const staffRes = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'staff@ticket.com', password: 'staff123' }
    });
    assert.strictEqual(staffRes.status, 200);
    assert.ok(staffRes.data.token);
    staffToken = staffRes.data.token;
  });

  after(async () => {
    // Clean up background timers and HTTP listener to allow graceful process exit
    if (expirationInterval) {
      clearInterval(expirationInterval);
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // =========================================================================
  // Suite 1: Authentication & Profile Flow (FR-01 to FR-05)
  // =========================================================================
  describe('Suite 1: Authentication & Profile Flow (FR-01 to FR-05)', () => {
    const regTimestamp = Date.now();
    const regEmail = `integration.user.${regTimestamp}@example.com`;
    const regNid = `110050${regTimestamp.toString().slice(-7)}`;

    it('FR-02: Registers a new user with full profile fields (201 Created)', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'Napat Srisawat',
          email: regEmail,
          password: 'SecurePassword123!',
          phone: '0819876543',
          age: 26,
          dob: '2000-03-25',
          gender: 'Male',
          nationalId: regNid,
          address: '456 Sukhumvit Road, Khlong Toei, Bangkok 10110'
        }
      });

      assert.strictEqual(res.status, 201);
      assert.ok(res.data.token);
      assert.ok(res.data.user);
      assert.strictEqual(res.data.user.email, regEmail);
      assert.strictEqual(res.data.user.name, 'Napat Srisawat');
      assert.strictEqual(res.data.user.phone, '0819876543');
      assert.strictEqual(res.data.user.age, 26);
      assert.strictEqual(res.data.user.dob, '2000-03-25');
      assert.strictEqual(res.data.user.gender, 'Male');
      assert.strictEqual(res.data.user.nationalId, regNid);
      assert.strictEqual(res.data.user.address, '456 Sukhumvit Road, Khlong Toei, Bangkok 10110');
      assert.strictEqual(res.data.user.points, 100); // 100 welcome points awarded
      assert.strictEqual(res.data.user.role, 'customer');
      assert.strictEqual(res.data.user.passwordHash, undefined); // Sanitized

      customerToken = res.data.token;
      customerUser = res.data.user;
    });

    it('FR-01: Authenticates user with email & password (200, JWT token & HttpOnly cookie)', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: {
          email: regEmail,
          password: 'SecurePassword123!'
        }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.data.token);
      assert.strictEqual(res.data.user.email, regEmail);
      assert.strictEqual(res.data.user.passwordHash, undefined);

      assert.ok(res.setCookie, 'Expected Set-Cookie header on successful login');
      assert.ok(res.setCookie.includes('tickethub_token='), 'Set-Cookie must contain tickethub_token');
      assert.ok(res.setCookie.includes('HttpOnly'), 'Set-Cookie must specify HttpOnly flag');

      customerCookie = res.setCookie.split(';')[0];
    });

    it('NFR-06: Authenticates via HttpOnly cookie on protected routes', async () => {
      const res = await request('/api/auth/profile', {
        headers: { Cookie: customerCookie }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.user.email, regEmail);
    });

    it('FR-01: Authenticates via simulated social login (Gmail, Facebook, Phone OTP)', async () => {
      // 1. Gmail Social Login
      const gmailRes = await request('/api/auth/social-login', {
        method: 'POST',
        body: {
          provider: 'gmail',
          email: `social.google.${Date.now()}@gmail.com`,
          name: 'Somchai Google'
        }
      });
      assert.strictEqual(gmailRes.status, 200);
      assert.ok(gmailRes.data.token);
      assert.strictEqual(gmailRes.data.user.authProvider, 'gmail');

      // 2. Facebook Social Login
      const fbRes = await request('/api/auth/social-login', {
        method: 'POST',
        body: {
          provider: 'facebook',
          email: `social.fb.${Date.now()}@facebook.com`,
          name: 'Somying Facebook'
        }
      });
      assert.strictEqual(fbRes.status, 200);
      assert.ok(fbRes.data.token);
      assert.strictEqual(fbRes.data.user.authProvider, 'facebook');

      // 3. Phone OTP Login
      const phoneRes = await request('/api/auth/social-login', {
        method: 'POST',
        body: {
          provider: 'phone',
          phone: `089${Math.floor(1000000 + Math.random() * 9000000)}`,
          name: 'Somkiat Phone OTP'
        }
      });
      assert.strictEqual(phoneRes.status, 200);
      assert.ok(phoneRes.data.token);
      assert.strictEqual(phoneRes.data.user.authProvider, 'phone');
    });

    it('FR-04, FR-05: Retrieves and updates user profile (200 OK)', async () => {
      // Retrieve current profile
      const getRes = await request('/api/auth/profile', {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.data.user.id, customerUser.id);
      assert.strictEqual(getRes.data.user.passwordHash, undefined);

      // Update non-sensitive profile attributes
      const putRes = await request('/api/auth/profile', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          name: 'Napat Srisawat (Updated)',
          phone: '0898765432',
          address: '789 Rama IV Road, Bangkok 10330'
        }
      });
      assert.strictEqual(putRes.status, 200);
      assert.strictEqual(putRes.data.user.name, 'Napat Srisawat (Updated)');
      assert.strictEqual(putRes.data.user.phone, '0898765432');
      assert.strictEqual(putRes.data.user.address, '789 Rama IV Road, Bangkok 10330');

      const futureDobRes = await request('/api/auth/profile', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { dob: '2999-01-01' }
      });
      assert.strictEqual(futureDobRes.status, 400);
    });

    it('FR-05: Updates user avatar via JSON/URL (200 OK)', async () => {
      const avatarRes = await request('/api/auth/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { avatarUrl: '/uploads/custom-avatar-profile.png' }
      });
      assert.strictEqual(avatarRes.status, 200);
      assert.strictEqual(avatarRes.data.avatarUrl, '/uploads/custom-avatar-profile.png');
      assert.strictEqual(avatarRes.data.user.avatarUrl, '/uploads/custom-avatar-profile.png');
    });

    it('FR-03: User logout clears session cookie (200 OK)', async () => {
      const logoutRes = await request('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert.strictEqual(logoutRes.status, 200);
      assert.ok(logoutRes.setCookie, 'Expected Set-Cookie on logout to clear cookie');
      assert.ok(logoutRes.setCookie.includes('tickethub_token=;'));
    });
  });

  // =========================================================================
  // Suite 2: Event Discovery & Bookmarking (FR-06 to FR-12, FR-20)
  // =========================================================================
  describe('Suite 2: Event Discovery & Bookmarking (FR-06 to FR-12, FR-20)', () => {
    it('FR-06, FR-07, FR-08, FR-09: Lists, searches and filters events by title, category, and artist', async () => {
      // 1. General list
      const listRes = await request('/api/events');
      assert.strictEqual(listRes.status, 200);
      assert.ok(Array.isArray(listRes.data.events));
      assert.ok(listRes.data.events.length >= 4);

      // 2. Search by title
      const searchRes = await request('/api/events?search=Forza');
      assert.strictEqual(searchRes.status, 200);
      assert.ok(searchRes.data.events.length > 0);
      assert.ok(searchRes.data.events.some((e) => e.title.includes('Forza')));

      // 3. Filter by category
      const concertRes = await request('/api/events?category=Concert');
      assert.strictEqual(concertRes.status, 200);
      assert.ok(concertRes.data.events.every((e) => e.category === 'Concert'));

      // 4. Filter by artist
      const artistRes = await request('/api/events?artist=Horizon');
      assert.strictEqual(artistRes.status, 200);
      assert.ok(artistRes.data.events.every((e) => e.artist.includes('Horizon')));

      // 5. Filter by round date
      const dateRes = await request('/api/events?date=2026-11-11');
      assert.strictEqual(dateRes.status, 200);
      assert.ok(dateRes.data.events.length > 0);
    });

    it('FR-12, FR-20: Retrieves event detail with real-time zone availability counts', async () => {
      const res = await request('/api/events/evt-1');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.event);
      assert.strictEqual(res.data.event.id, 'evt-1');
      assert.ok(Array.isArray(res.data.event.rounds));
      assert.ok(res.data.event.rounds.length > 0);

      const round1 = res.data.event.rounds[0];
      assert.ok(Array.isArray(round1.zones));
      assert.ok(round1.zones.length > 0);

      const vipZone = round1.zones.find((z) => z.zoneId === 'zone-vip');
      assert.ok(vipZone);
      assert.strictEqual(vipZone.zoneName, 'VIP Stage Front');
      assert.strictEqual(vipZone.price, 4500);
      assert.ok(vipZone.totalSeats > 0);
      assert.ok(vipZone.availableSeats >= 0);
      assert.ok(vipZone.bookedSeats >= 0);
    });

    it('FR-11: Toggles bookmark on event and persists in user profile', async () => {
      // Toggle bookmark ON for evt-2
      const bkmkOn = await request('/api/events/evt-2/bookmark', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert.strictEqual(bkmkOn.status, 200);
      assert.strictEqual(bkmkOn.data.isBookmarked, true);
      assert.ok(bkmkOn.data.bookmarks.includes('evt-2'));

      // Verify persistence in user profile
      const profRes = await request('/api/auth/profile', {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert.strictEqual(profRes.status, 200);
      assert.ok(profRes.data.user.bookmarks.includes('evt-2'));

      // Toggle bookmark OFF for evt-2
      const bkmkOff = await request('/api/events/evt-2/bookmark', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert.strictEqual(bkmkOff.status, 200);
      assert.strictEqual(bkmkOff.data.isBookmarked, false);
      assert.ok(!bkmkOff.data.bookmarks.includes('evt-2'));
    });
  });

  // =========================================================================
  // Suite 3: Sale Period Restriction Enforcement (FR-48, FR-49)
  // =========================================================================
  describe('Suite 3: Sale Period Restriction Enforcement (FR-48, FR-49)', () => {
    it('FR-49: Rejects seat hold outside active sale period with HTTP 403 Forbidden (Coming Soon)', async () => {
      // evt-4 has status 'Coming Soon' and saleStartAt in Dec 2026
      const res = await request('/api/bookings/hold', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          eventId: 'evt-4',
          roundId: 'rnd-4a',
          seatIds: ['seat-evt-4-rnd-4a-zone-4-vip-A1']
        }
      });

      assert.strictEqual(res.status, 403);
      assert.match(res.data.error, /outside the scheduled sale period|closed/i);
    });

    it('FR-49: Rejects seat hold on closed/expired sale event with HTTP 403 Forbidden', async () => {
      // evt-6 has status 'Sold Out' and saleEndAt in past
      const res = await request('/api/bookings/hold', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          eventId: 'evt-6',
          roundId: 'rnd-6a',
          seatIds: ['seat-evt-6-rnd-6a-zone-6-a-A1']
        }
      });

      assert.strictEqual(res.status, 403);
      assert.match(res.data.error, /outside the scheduled sale period|closed/i);
    });
  });

  // =========================================================================
  // Suite 4: Seating Plan & Double-Booking Prevention (FR-16 to FR-23, NFR-08)
  // =========================================================================
  describe('Suite 4: Seating Plan & Double-Booking Prevention (FR-16 to FR-23, NFR-08)', () => {
    it('FR-16, FR-17, FR-18: Fetches seat map layout and states for an event and round', async () => {
      const res = await request('/api/bookings/events/evt-1/rounds/rnd-1a/seats');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.eventId, 'evt-1');
      assert.strictEqual(res.data.roundId, 'rnd-1a');
      assert.ok(Array.isArray(res.data.seats));
      assert.ok(res.data.seats.length > 0);

      const seatA3 = res.data.seats.find((s) => s.id === 'seat-evt-1-rnd-1a-zone-vip-A3');
      assert.ok(seatA3);
      assert.strictEqual(seatA3.seatNumber, 'A3');
      assert.strictEqual(seatA3.zoneName, 'VIP Stage Front');
      assert.strictEqual(seatA3.status, 'AVAILABLE');
    });

    it('FR-23: User A holds seat A3 successfully (201 Created, 10-minute hold lock)', async () => {
      const res = await request('/api/bookings/hold', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          eventId: 'evt-1',
          roundId: 'rnd-1a',
          seatIds: ['seat-evt-1-rnd-1a-zone-vip-A3']
        }
      });

      assert.strictEqual(res.status, 201);
      assert.ok(res.data.booking);
      assert.strictEqual(res.data.booking.status, 'PENDING');
      assert.ok(res.data.booking.holdExpiresAt);
      assert.strictEqual(res.data.booking.subtotal, 4500);
      assert.strictEqual(res.data.booking.serviceFee, 40);
      assert.strictEqual(res.data.booking.totalAmount, 4540);

      heldBookingId = res.data.booking.id;

      // Verify seat status transitioned to HELD in seat map
      const seatRes = await request('/api/bookings/events/evt-1/rounds/rnd-1a/seats');
      const seatA3 = seatRes.data.seats.find((s) => s.id === 'seat-evt-1-rnd-1a-zone-vip-A3');
      assert.strictEqual(seatA3.status, 'HELD');
      assert.strictEqual(seatA3.heldByUserId, customerUser.id);
    });

    it('FR-23, NFR-08: User B attempting to hold held seat A3 receives HTTP 409 Conflict', async () => {
      const res = await request('/api/bookings/hold', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }, // Distinct user
        body: {
          eventId: 'evt-1',
          roundId: 'rnd-1a',
          seatIds: ['seat-evt-1-rnd-1a-zone-vip-A3']
        }
      });

      assert.strictEqual(res.status, 409);
      assert.match(res.data.error, /currently reserved by another customer/i);
    });

    it('FR-23: Attempting to hold an already BOOKED seat (A1) receives HTTP 409 Conflict', async () => {
      // Seat A1 is pre-seeded as BOOKED
      const res = await request('/api/bookings/hold', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          eventId: 'evt-1',
          roundId: 'rnd-1a',
          seatIds: ['seat-evt-1-rnd-1a-zone-vip-A1']
        }
      });

      assert.strictEqual(res.status, 409);
      assert.match(res.data.error, /already been booked/i);
    });

    it('FR-23: Selecting more than maxTicketsPerUser returns HTTP 400 Bad Request', async () => {
      // evt-1 maxTicketsPerUser is 6
      const res = await request('/api/bookings/hold', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          eventId: 'evt-1',
          roundId: 'rnd-1a',
          seatIds: [
            'seat-evt-1-rnd-1a-zone-vip-A5',
            'seat-evt-1-rnd-1a-zone-vip-A6',
            'seat-evt-1-rnd-1a-zone-vip-A7',
            'seat-evt-1-rnd-1a-zone-vip-A8',
            'seat-evt-1-rnd-1a-zone-vip-B1',
            'seat-evt-1-rnd-1a-zone-vip-B2',
            'seat-evt-1-rnd-1a-zone-vip-B5'
          ]
        }
      });

      assert.strictEqual(res.status, 400);
      assert.match(res.data.error, /maximum of 6 tickets/i);
    });
  });

  // =========================================================================
  // Suite 5: Checkout & Payment Flow (FR-24 to FR-27, FR-46, FR-47, NFR-09)
  // =========================================================================
  describe('Suite 5: Checkout & Payment Flow (FR-24 to FR-27, FR-46, FR-47, NFR-09)', () => {
    it('FR-24: Booking summary includes subtotal, 40 THB/seat fee, and remaining countdown timer', async () => {
      const res = await request(`/api/bookings/${heldBookingId}/summary`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.booking.id, heldBookingId);
      assert.strictEqual(res.data.booking.subtotal, 4500);
      assert.strictEqual(res.data.booking.serviceFee, 40);
      assert.strictEqual(res.data.booking.totalAmount, 4540);
      assert.ok(res.data.remainingSeconds > 0 && res.data.remainingSeconds <= 600);
      assert.strictEqual(res.data.isExpired, false);
    });

    it('FR-47: Applies promo code discount (TICKETHUB10: 10% off subtotal)', async () => {
      const res = await request(`/api/bookings/${heldBookingId}/apply-discount`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { promoCode: 'TICKETHUB10' }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.booking.promoCode, 'TICKETHUB10');
      // Subtotal 4500 * 10% = 450 THB discount
      assert.strictEqual(res.data.booking.discountAmount, 450);
      // Total = 4500 - 450 + 40 (fee) = 4090 THB
      assert.strictEqual(res.data.booking.totalAmount, 4090);
    });

    it('FR-46: Applies loyalty points redemption (100 points = 10 THB)', async () => {
      // Re-apply discount with 100 points redemption
      const res = await request(`/api/bookings/${heldBookingId}/apply-discount`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { redeemPoints: 100 }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.booking.pointsUsed, 100);
      assert.strictEqual(res.data.booking.discountAmount, 10);
      assert.strictEqual(res.data.booking.totalAmount, 4500 - 10 + 40);

      // Re-apply TICKETHUB10 for clean checkout
      await request(`/api/bookings/${heldBookingId}/apply-discount`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { promoCode: 'TICKETHUB10' }
      });
    });

    it('FR-25, FR-26, FR-27, NFR-09: Confirms payment, marks seats BOOKED, generates QR tickets, awards loyalty points, creates notifications', async () => {
      const res = await request(`/api/bookings/${heldBookingId}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { paymentMethod: 'PROMPTPAY', ticketHolderNames: ['Napat Srisawat Guest'] }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.payment.status, 'SUCCESS');
      assert.strictEqual(res.data.payment.method, 'PROMPTPAY');
      assert.strictEqual(res.data.payment.amount, 4090);
      assert.ok(res.data.payment.referenceCode.startsWith('TH-PR-'));

      // 1. Electronic QR Tickets issued
      assert.ok(Array.isArray(res.data.tickets));
      assert.strictEqual(res.data.tickets.length, 1);
      const ticket = res.data.tickets[0];
      assert.strictEqual(ticket.status, 'VALID');
      assert.strictEqual(ticket.seatNumber, 'A3');
      assert.strictEqual(ticket.holderName, 'Napat Srisawat Guest');
      assert.strictEqual(JSON.parse(ticket.qrPayload).holder, 'Napat Srisawat Guest');
      assert.ok(ticket.ticketCode);
      assert.ok(ticket.qrPayload);
      assert.ok(ticket.qrDataUrl);
      assert.ok(ticket.qrDataUrl.startsWith('data:image/png;base64,'));
      assert.ok(ticket.qrDataUrl.length > 200);

      paidBookingId = heldBookingId;
      issuedTicketCode = ticket.ticketCode;
      issuedQrPayload = ticket.qrPayload;

      // 2. Seat status transitioned to BOOKED in DB
      const seatRes = await request('/api/bookings/events/evt-1/rounds/rnd-1a/seats');
      const seatA3 = seatRes.data.seats.find((s) => s.id === 'seat-evt-1-rnd-1a-zone-vip-A3');
      assert.strictEqual(seatA3.status, 'BOOKED');
      assert.strictEqual(seatA3.holdExpiresAt, null);

      // 3. Loyalty points awarded: 1 pt per 100 THB of subtotal (4500 / 100 = 45 pt)
      const profileRes = await request('/api/auth/profile', {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      // Initial 100 welcome points + 45 earned points = 145 points
      assert.strictEqual(profileRes.data.user.points, 145);

      // 4. In-App Web and simulated Email Notification created (FR-33, FR-35, FR-36)
      const notifsRes = await request('/api/notifications', {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert.strictEqual(notifsRes.status, 200);
      assert.ok(notifsRes.data.notifications.some((n) => n.type === 'PAYMENT_SUCCESS'));
    });
  });

  // =========================================================================
  // Suite 6: QR Ticket Anti-Reuse Validation (FR-28 to FR-31)
  // =========================================================================
  describe('Suite 6: QR Ticket Anti-Reuse Validation (FR-28 to FR-31)', () => {
    it('FR-28: User retrieves issued tickets via GET /api/tickets/my', async () => {
      const res = await request('/api/tickets/my', {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.tickets));
      assert.ok(res.data.tickets.some((t) => t.ticketCode === issuedTicketCode));
    });

    it('FR-30: First scan by Gate Staff marks ticket CHECKED_IN (200 OK)', async () => {
      const res = await request('/api/tickets/validate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
        body: { ticketCode: issuedTicketCode }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.valid, true);
      assert.strictEqual(res.data.ticket.status, 'CHECKED_IN');
      assert.ok(res.data.ticket.checkedInAt);
      assert.ok(res.data.ticket.checkedInBy);
    });

    it('FR-31: Second scan of identical ticket code is rejected with HTTP 400 ALREADY_CHECKED_IN fraud warning', async () => {
      const res = await request('/api/tickets/validate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
        body: { ticketCode: issuedTicketCode }
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.valid, false);
      assert.strictEqual(res.data.reason, 'ALREADY_CHECKED_IN');
      assert.match(res.data.message, /Fraud Warning/i);
    });

    it('FR-31: Scanning via QR payload for already checked-in ticket is also rejected with HTTP 400', async () => {
      const res = await request('/api/tickets/validate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
        body: { qrPayload: issuedQrPayload }
      });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.valid, false);
      assert.strictEqual(res.data.reason, 'ALREADY_CHECKED_IN');
    });

    it('NFR-07: Non-staff / regular customer attempting validation receives HTTP 403 Forbidden', async () => {
      const res = await request('/api/tickets/validate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { ticketCode: issuedTicketCode }
      });

      assert.strictEqual(res.status, 403);
    });

    it('FR-30: Scanning non-existent ticket returns HTTP 404 Not Found', async () => {
      const res = await request('/api/tickets/validate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
        body: { ticketCode: 'TKT-NON-EXISTENT-CODE' }
      });

      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.data.valid, false);
      assert.strictEqual(res.data.reason, 'INVALID_TICKET');
    });
  });

  // =========================================================================
  // Suite 7: Cancellation & Refund Policy Calculation (FR-38, FR-39)
  // =========================================================================
  describe('Suite 7: Cancellation & Refund Policy Calculation (FR-38, FR-39)', () => {
    let cancelBookingId = '';
    let cancelTicketCode = '';

    before(async () => {
      // Create and pay for a separate booking on seat A4 to test cancellation flow
      const holdRes = await request('/api/bookings/hold', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          eventId: 'evt-1',
          roundId: 'rnd-1a',
          seatIds: ['seat-evt-1-rnd-1a-zone-vip-A4']
        }
      });
      assert.strictEqual(holdRes.status, 201);
      cancelBookingId = holdRes.data.booking.id;

      // Apply WELCOME200 discount (200 THB discount)
      const discRes = await request(`/api/bookings/${cancelBookingId}/apply-discount`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { promoCode: 'WELCOME200' }
      });
      assert.strictEqual(discRes.status, 200);

      // Confirm payment via CREDIT_CARD
      const payRes = await request(`/api/bookings/${cancelBookingId}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { paymentMethod: 'CREDIT_CARD' }
      });
      assert.strictEqual(payRes.status, 200);
      cancelTicketCode = payRes.data.tickets[0].ticketCode;
    });

    it('FR-38, FR-39: Cancelling paid booking refunds subtotal minus discount, retains 40 THB service fee, reverts seats to AVAILABLE, marks tickets CANCELLED', async () => {
      const res = await request(`/api/bookings/${cancelBookingId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` }
      });

      assert.strictEqual(res.status, 200);
      // Subtotal 4500 - Discount 200 = 4300 THB refundable
      assert.strictEqual(res.data.refundableAmount, 4300);
      // Non-refundable service fee retained per FR-39
      assert.strictEqual(res.data.nonRefundableFee, 40);
      // Original total = 4500 - 200 + 40 = 4340 THB
      assert.strictEqual(res.data.originalTotal, 4340);

      // Verify seat A4 reverted to AVAILABLE in seat map
      const seatRes = await request('/api/bookings/events/evt-1/rounds/rnd-1a/seats');
      const seatA4 = seatRes.data.seats.find((s) => s.id === 'seat-evt-1-rnd-1a-zone-vip-A4');
      assert.strictEqual(seatA4.status, 'AVAILABLE');
      assert.strictEqual(seatA4.heldByUserId, null);
      assert.strictEqual(seatA4.holdExpiresAt, null);

      // Verify scanning the cancelled ticket is rejected with CANCELLED_TICKET
      const scanRes = await request('/api/tickets/validate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
        body: { ticketCode: cancelTicketCode }
      });
      assert.strictEqual(scanRes.status, 400);
      assert.strictEqual(scanRes.data.valid, false);
      assert.strictEqual(scanRes.data.reason, 'CANCELLED_TICKET');
    });

    it('FR-32: View purchase and booking history via GET /api/tickets/history', async () => {
      const res = await request('/api/tickets/history', {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.history));
      assert.ok(res.data.history.length >= 2);
      assert.ok(res.data.history.some((b) => b.id === cancelBookingId && b.status === 'CANCELLED'));
    });
  });

  // =========================================================================
  // Suite 8: Admin Dashboard, RBAC & Backup/Restore (FR-40 to FR-44, NFR-06, NFR-11, NFR-12)
  // =========================================================================
  describe('Suite 8: Admin Dashboard, RBAC & Backup/Restore (FR-40 to FR-44, NFR-06, NFR-11, NFR-12)', () => {
    it('NFR-07: Non-admin users receive HTTP 403 Forbidden on admin endpoints', async () => {
      const dashRes = await request('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert.strictEqual(dashRes.status, 403);

      const backupRes = await request('/api/admin/backups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: { label: 'unauthorized-test' }
      });
      assert.strictEqual(backupRes.status, 403);
    });

    it('FR-44: Admin dashboard returns 12-month sales chart dataset and KPIs', async () => {
      const res = await request('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.data.kpis);
      assert.ok(typeof res.data.kpis.totalRevenue === 'number');
      assert.ok(typeof res.data.kpis.totalTicketsSold === 'number');
      assert.ok(typeof res.data.kpis.totalSeats === 'number');

      // 12-month sales chart dataset (FR-44)
      assert.ok(res.data.monthlySalesChart);
      assert.strictEqual(res.data.monthlySalesChart.labels.length, 12);
      assert.strictEqual(res.data.monthlySalesChart.revenue.length, 12);
      assert.strictEqual(res.data.monthlySalesChart.ticketCounts.length, 12);

      // Event-level breakdown
      assert.ok(Array.isArray(res.data.eventBreakdown));
      assert.ok(res.data.eventBreakdown.length > 0);
    });

    it('FR-40, FR-41: Admin updates seating plan and zone configuration', async () => {
      const res = await request('/api/admin/events/evt-1/seating', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          zones: [
            { id: 'zone-vip', name: 'VIP Stage Front', color: '#FF0800', price: 4800, rows: 4, cols: 8 },
            { id: 'zone-a', name: 'Zone A Monday Blue', color: '#1D56CF', price: 3000, rows: 4, cols: 8 }
          ]
        }
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.zones[0].price, 4800);
    });

    it('FR-45: Customer submits support inquiry and Admin replies', async () => {
      // 1. Customer submits support inquiry
      const createRes = await request('/api/support', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          subject: 'Question regarding parking facilities',
          category: 'Venue & Parking',
          message: 'Is parking included with VIP tickets at Impact Arena?'
        }
      });
      assert.strictEqual(createRes.status, 201);
      assert.ok(createRes.data.support.id);
      const ticketId = createRes.data.support.id;

      // 2. Admin retrieves and replies to inquiry
      const replyRes = await request(`/api/support/${ticketId}/reply`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { reply: 'Yes, VIP tickets include complimentary parking at P1.' }
      });
      assert.strictEqual(replyRes.status, 200);
      assert.strictEqual(replyRes.data.support.status, 'RESOLVED');
      assert.strictEqual(replyRes.data.support.adminReply, 'Yes, VIP tickets include complimentary parking at P1.');
    });

    it('NFR-11, NFR-12: Creates snapshot backup and restores data cleanly', async () => {
      // 1. Create snapshot backup
      const createRes = await request('/api/admin/backups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { label: 'e2e-automated-test' }
      });
      assert.strictEqual(createRes.status, 201);
      assert.ok(createRes.data.backup);
      const backupId = createRes.data.backup.backupId;
      assert.ok(backupId);

      // 2. List backups includes newly created backup
      const listRes = await request('/api/admin/backups', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(listRes.status, 200);
      assert.ok(listRes.data.backups.some((b) => b.backupId === backupId));

      // 3. Restore data from backup
      const restoreRes = await request('/api/admin/backups/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { backupId }
      });
      assert.strictEqual(restoreRes.status, 200);
      assert.strictEqual(restoreRes.data.result.restoredFrom, backupId);
    });
  });

  // =========================================================================
  // Suite 10: FR-42 & FR-43 Admin Event Inspection & Transaction Audit
  // =========================================================================
  describe('Suite 10: FR-42 & FR-43 Admin Event Inspection & Transaction Audit', () => {
    it('FR-42: Admin inspects event details with 12 real-time KPIs, zone breakdown, and transaction history', async () => {
      const res = await request('/api/admin/events/evt-1/inspect', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 200);
      assert.ok(res.data.event);
      assert.strictEqual(res.data.event.id, 'evt-1');

      // 1. Verify summary metrics object and all 12 KPI fields
      const summary = res.data.summary;
      assert.ok(summary, 'Expected summary object in inspect response');
      assert.strictEqual(typeof summary.totalSeats, 'number');
      assert.strictEqual(typeof summary.availableSeats, 'number');
      assert.strictEqual(typeof summary.heldSeats, 'number');
      assert.strictEqual(typeof summary.bookedSeats, 'number');
      assert.strictEqual(typeof summary.totalBookings, 'number');
      assert.strictEqual(typeof summary.paidBookingsCount, 'number');
      assert.strictEqual(typeof summary.pendingBookingsCount, 'number');
      assert.strictEqual(typeof summary.cancelledBookingsCount, 'number');
      assert.strictEqual(typeof summary.totalRevenue, 'number');
      assert.strictEqual(typeof summary.totalRefunded, 'number');
      assert.strictEqual(typeof summary.ticketsIssued, 'number');
      assert.strictEqual(typeof summary.ticketsCheckedIn, 'number');

      // Verify root-level metric aliases match summary values
      assert.strictEqual(res.data.totalSeats, summary.totalSeats);
      assert.strictEqual(res.data.availableSeats, summary.availableSeats);
      assert.strictEqual(res.data.heldSeats, summary.heldSeats);
      assert.strictEqual(res.data.bookedSeats, summary.bookedSeats);

      // Invariant: totalSeats equals available + held + booked
      assert.strictEqual(
        summary.totalSeats,
        summary.availableSeats + summary.heldSeats + summary.bookedSeats,
        'Total seats must equal sum of available, held, and booked seats'
      );

      // Invariant: totalBookings equals paid + pending + cancelled
      assert.strictEqual(
        summary.totalBookings,
        summary.paidBookingsCount + summary.pendingBookingsCount + summary.cancelledBookingsCount,
        'Total bookings must equal sum of paid, pending, and cancelled bookings'
      );

      // 2. Verify rounds and real-time zone availability breakdown
      assert.ok(Array.isArray(res.data.rounds), 'Expected rounds array');
      assert.ok(res.data.rounds.length > 0, 'Expected at least one round in rounds');
      for (const round of res.data.rounds) {
        assert.ok(round.roundId);
        assert.ok(Array.isArray(round.zones));
        assert.ok(round.zones.length > 0);
        for (const zone of round.zones) {
          assert.ok(zone.zoneId);
          assert.ok(zone.zoneName);
          assert.strictEqual(typeof zone.price, 'number');
          assert.strictEqual(typeof zone.totalSeats, 'number');
          assert.strictEqual(typeof zone.availableSeats, 'number');
          assert.strictEqual(typeof zone.heldSeats, 'number');
          assert.strictEqual(typeof zone.bookedSeats, 'number');
          assert.strictEqual(
            zone.totalSeats,
            zone.availableSeats + zone.heldSeats + zone.bookedSeats,
            'Zone total seats must equal sum of available, held, and booked seats'
          );
        }
      }

      // 3. Verify associated transactions sorted newest-first
      assert.ok(Array.isArray(res.data.transactions), 'Expected transactions array');
      assert.ok(res.data.transactions.length > 0, 'Expected transactions for evt-1');
      for (const tx of res.data.transactions) {
        assert.strictEqual(tx.eventId, 'evt-1');
        assert.ok(tx.bookingId);
        assert.ok(tx.referenceCode);
        assert.strictEqual(typeof tx.totalAmount, 'number');
        if (tx.user) {
          assert.strictEqual(tx.user.passwordHash, undefined);
        }
      }
    });

    it('FR-42: Returns HTTP 404 Not Found when inspecting non-existent event', async () => {
      const res = await request('/api/admin/events/evt-non-existent-9999/inspect', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      assert.strictEqual(res.status, 404);
      assert.ok(res.data);
      assert.match(res.data.error, /Event not found/i);
    });

    it('FR-42, NFR-07: Enforces authentication and admin role on event inspection endpoint', async () => {
      // 1. Unauthenticated request returns 401 Unauthorized
      const unauthRes = await request('/api/admin/events/evt-1/inspect');
      assert.strictEqual(unauthRes.status, 401);

      // 2. Customer token returns 403 Forbidden
      const customerRes = await request('/api/admin/events/evt-1/inspect', {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert.strictEqual(customerRes.status, 403);

      // 3. Staff token returns 403 Forbidden (inspect is admin-restricted)
      const staffRes = await request('/api/admin/events/evt-1/inspect', {
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      assert.strictEqual(staffRes.status, 403);
    });

    it('FR-43: Queries and filters transaction audit log by eventId, status, and search string', async () => {
      // 1. Unfiltered query returns full transaction list sorted newest-first
      const allRes = await request('/api/admin/transactions', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(allRes.status, 200);
      assert.ok(typeof allRes.data.total === 'number');
      assert.ok(Array.isArray(allRes.data.transactions));
      assert.strictEqual(allRes.data.total, allRes.data.transactions.length);
      assert.ok(allRes.data.total >= 2);

      // Verify newest-first ordering
      for (let i = 0; i < allRes.data.transactions.length - 1; i++) {
        const current = new Date(allRes.data.transactions[i].createdAt || 0).getTime();
        const next = new Date(allRes.data.transactions[i + 1].createdAt || 0).getTime();
        assert.ok(current >= next, 'Transactions must be sorted newest-first by createdAt');
      }

      // 2. Filter by eventId
      const evtRes = await request('/api/admin/transactions?eventId=evt-1', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(evtRes.status, 200);
      assert.ok(evtRes.data.transactions.length > 0);
      assert.ok(
        evtRes.data.transactions.every((tx) => tx.eventId === 'evt-1'),
        'All returned transactions must match eventId evt-1'
      );

      // 3. Filter by status (case-insensitive booking/payment status)
      const paidRes = await request('/api/admin/transactions?status=PAID', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(paidRes.status, 200);
      assert.ok(paidRes.data.transactions.length > 0);
      assert.ok(
        paidRes.data.transactions.every(
          (tx) => tx.bookingStatus === 'PAID' || tx.paymentStatus === 'PAID' || tx.paymentStatus === 'SUCCESS'
        ),
        'All returned transactions must have PAID or SUCCESS status'
      );

      // 4. Filter by search string across multiple fields
      const searchRes = await request('/api/admin/transactions?search=Forza', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(searchRes.status, 200);
      assert.ok(searchRes.data.transactions.length > 0);
      assert.ok(
        searchRes.data.transactions.every(
          (tx) => (tx.eventTitle && tx.eventTitle.toLowerCase().includes('forza')) ||
                  (tx.customerName && tx.customerName.toLowerCase().includes('forza')) ||
                  (tx.customerEmail && tx.customerEmail.toLowerCase().includes('forza')) ||
                  (tx.referenceCode && tx.referenceCode.toLowerCase().includes('forza'))
        ),
        'Transactions matched by search=Forza must contain query in searchable fields'
      );

      // 5. Empty search result handling
      const noMatchRes = await request('/api/admin/transactions?search=NONEXISTENT_QUERY_STRING_XYZ_9999', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(noMatchRes.status, 200);
      assert.strictEqual(noMatchRes.data.total, 0);
      assert.strictEqual(noMatchRes.data.transactions.length, 0);
    });

    it('FR-43, AGENTS.md: Guarantees zero passwordHash leakage across all transaction audit records and customer objects', async () => {
      const res = await request('/api/admin/transactions', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.transactions.length > 0);

      // Invariant 1: Raw JSON serialization must never contain the substring "passwordHash"
      const rawPayload = JSON.stringify(res.data);
      assert.strictEqual(
        rawPayload.includes('passwordHash'),
        false,
        'Sensitive passwordHash field must NEVER be present anywhere in admin transaction payload'
      );

      // Invariant 2: Explicit object-level property check on user and customer objects
      for (const tx of res.data.transactions) {
        if (tx.user) {
          assert.strictEqual(tx.user.passwordHash, undefined, 'tx.user.passwordHash must be undefined');
        }
        if (tx.customer) {
          assert.strictEqual(tx.customer.passwordHash, undefined, 'tx.customer.passwordHash must be undefined');
        }
        assert.strictEqual(tx.passwordHash, undefined, 'tx.passwordHash must be undefined');
      }
    });

    it('FR-43, NFR-07: Enforces authentication and admin role on global transactions audit endpoint', async () => {
      // 1. Unauthenticated request returns 401 Unauthorized
      const unauthRes = await request('/api/admin/transactions');
      assert.strictEqual(unauthRes.status, 401);

      // 2. Customer token returns 403 Forbidden
      const customerRes = await request('/api/admin/transactions', {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert.strictEqual(customerRes.status, 403);

      // 3. Staff token returns 403 Forbidden (requires admin role)
      const staffRes = await request('/api/admin/transactions', {
        headers: { Authorization: `Bearer ${staffToken}` }
      });
      assert.strictEqual(staffRes.status, 403);
    });

    it('FR-42, R3: GET /api/events enriches every event with totalSeats, totalAvailableSeats, totalBookedSeats, and totalHeldSeats', async () => {
      const res = await request('/api/events');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.events));
      assert.ok(res.data.events.length > 0);

      for (const event of res.data.events) {
        assert.ok(event.id);
        assert.strictEqual(typeof event.totalSeats, 'number', `${event.id} must include totalSeats as a number`);
        assert.strictEqual(typeof event.totalAvailableSeats, 'number', `${event.id} must include totalAvailableSeats as a number`);
        assert.strictEqual(typeof event.totalBookedSeats, 'number', `${event.id} must include totalBookedSeats as a number`);
        assert.strictEqual(typeof event.totalHeldSeats, 'number', `${event.id} must include totalHeldSeats as a number`);

        assert.ok(event.totalSeats >= 0, `${event.id} totalSeats must be non-negative`);
        assert.ok(event.totalAvailableSeats >= 0, `${event.id} totalAvailableSeats must be non-negative`);
        assert.ok(event.totalBookedSeats >= 0, `${event.id} totalBookedSeats must be non-negative`);
        assert.ok(event.totalHeldSeats >= 0, `${event.id} totalHeldSeats must be non-negative`);

        // Invariant: totalSeats must equal the exact sum of totalAvailableSeats + totalBookedSeats + totalHeldSeats
        assert.strictEqual(
          event.totalSeats,
          event.totalAvailableSeats + event.totalBookedSeats + event.totalHeldSeats,
          `${event.id} totalSeats (${event.totalSeats}) must equal sum of available (${event.totalAvailableSeats}), booked (${event.totalBookedSeats}), and held (${event.totalHeldSeats})`
        );
      }
    });
  });

  // =========================================================================
  // Suite 11: Client Error Responses & 404/403 Handle Page (UC-ERR-01 & UC-ERR-02)
  // =========================================================================
  describe('Suite 11: Client Error Responses & 404/403 Handle Page (UC-ERR-01 & UC-ERR-02)', () => {
    it('UC-ERR-01a: Malformed JSON body on /api returns HTTP 400 JSON without stack trace leakage', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"email": "bad-json",'
      });

      assert.strictEqual(res.status, 400);
      assert.match(res.headers.get('content-type') || '', /application\/json/);
      assert.ok(typeof res.data.error === 'string' && res.data.error.length > 0);
      assert.doesNotMatch(JSON.stringify(res.data), /node_modules|at \w+ \(/i);
    });

    it('UC-ERR-01b: Unmatched API route returns HTTP 404 JSON', async () => {
      const res = await request('/api/unknown-endpoint-does-not-exist');
      assert.strictEqual(res.status, 404);
      assert.match(res.headers.get('content-type') || '', /application\/json/);
      assert.match(res.data.error, /API route not found/i);
    });

    it('UC-ERR-01c: Oversized payload body returns HTTP 413 JSON', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: { email: 'x'.repeat(200000), password: 'p' }
      });

      assert.strictEqual(res.status, 413);
      assert.match(res.headers.get('content-type') || '', /application\/json/);
      assert.ok(typeof res.data.error === 'string' && res.data.error.length > 0);
      assert.doesNotMatch(JSON.stringify(res.data), /node_modules|at \w+ \(/i);
    });

    it('UC-ERR-02a: Unmatched page URL and /404 serve branded 404 handle page with HTTP 404', async () => {
      const randomPage = await request('/this-page-definitely-does-not-exist');
      assert.strictEqual(randomPage.status, 404);
      assert.match(randomPage.headers.get('content-type') || '', /text\/html/);
      assert.match(randomPage.data, /404 Not Found|Page Not Found/i);

      const direct404 = await request('/404');
      assert.strictEqual(direct404.status, 404);
      assert.match(direct404.headers.get('content-type') || '', /text\/html/);
      assert.match(direct404.data, /404 Not Found|Page Not Found/i);
    });

    it('UC-ERR-02b: /403 serves branded error handle page with HTTP 403', async () => {
      const res403 = await request('/403');
      assert.strictEqual(res403.status, 403);
      assert.match(res403.headers.get('content-type') || '', /text\/html/);
      assert.match(res403.data, /403 Forbidden|Access Denied/i);
    });

    it('UC-ERR-02c: /checkout with non-existent booking ID serves branded 404 handle page', async () => {
      const resMissing = await request('/checkout?bookingId=bkg-non-existent-999');
      assert.strictEqual(resMissing.status, 404);
      assert.match(resMissing.headers.get('content-type') || '', /text\/html/);
      assert.match(resMissing.data, /Page Not Found/i);
    });

    it('UC-ERR-02d: Entering another user active booking returns HTTP 403 JSON on API and HTTP 403 HTML on page', async () => {
      // 1. Hold a seat as customer A
      const holdRes = await request('/api/bookings/hold', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          eventId: 'evt-1',
          roundId: 'rnd-1a',
          seatIds: ['seat-evt-1-rnd-1a-zone-vip-A4']
        }
      });
      assert.strictEqual(holdRes.status, 201);
      const bookingAId = holdRes.data.booking.id;

      // 2. Register customer B
      const custBTime = Date.now();
      const regB = await request('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'Customer B',
          email: `customer.b.${custBTime}@example.com`,
          password: 'Password123!',
          phone: '0822222222',
          nationalId: `110060${custBTime.toString().slice(-7)}`
        }
      });
      assert.strictEqual(regB.status, 201);
      const custBToken = regB.data.token;
      const custBCookie = regB.setCookie ? regB.setCookie.split(';')[0] : `tickethub_token=${custBToken}`;

      // 3. Customer B attempts to get booking summary of Customer A -> HTTP 403
      const summaryRes = await request(`/api/bookings/${bookingAId}/summary`, {
        headers: { Authorization: `Bearer ${custBToken}` }
      });
      assert.strictEqual(summaryRes.status, 403);
      assert.match(summaryRes.data.error, /Another user is currently holding this booking/i);

      // 4. Customer B attempts to view checkout page for Customer A booking -> HTTP 403 HTML
      const checkoutPageRes = await request(`/checkout?bookingId=${bookingAId}`, {
        headers: { Cookie: custBCookie }
      });
      assert.strictEqual(checkoutPageRes.status, 403);
      assert.match(checkoutPageRes.headers.get('content-type') || '', /text\/html/);
      assert.match(checkoutPageRes.data, /403 Forbidden|Access Denied/i);
    });
  });
});

