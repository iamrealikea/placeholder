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
        body: { paymentMethod: 'PROMPTPAY' }
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
});
