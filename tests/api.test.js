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
 * - Suite 12: Event Filter by Province/Location, Month & Price Sort (FR-08, FR-09)
 * - Suite 13: Booking Access Control & Booking History (FR-23, FR-32)
 * - Suite 14: Google & Facebook Social Login (FR-01)
 * - Suite 15: Social Token Verification Service (Google & Facebook)
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
const socialAuth = require('../src/services/socialAuth');

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

    it('FR-01: Demo phone OTP login still works outside production (200 OK)', async () => {
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

  // =========================================================================
  // Suite 12: Event Filtering by Province / Location / Month and Price Sorting (FR-08, FR-09)
  // Uses events created through the admin API with a unique tag, so the assertions
  // do not depend on whichever events the seed data happens to contain.
  // =========================================================================
  describe('Suite 12: Event Filter by Province/Location, Month & Price Sort (FR-08, FR-09)', () => {
    const tag = `FLT${Date.now()}`;
    const fixtures = {
      A: { province: 'Chiang Mai', venue: 'Nimman Hall', date: '2027-03-10', price: 500 },
      B: { province: 'Chiang Mai', venue: 'Old City Arena', date: '2027-04-05', price: 900 },
      C: { province: 'Phuket', venue: 'Patong Beach Stage', date: '2027-03-20', price: 200 }
    };
    const created = {};
    const authAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
    const titlesOf = (res) => res.data.events.map((e) => e.title.replace(`${tag} `, ''));
    const minPrice = (e) => Math.min(...e.zones.map((z) => z.price));

    before(async () => {
      for (const [key, f] of Object.entries(fixtures)) {
        const res = await request('/api/events', {
          method: 'POST',
          headers: authAdmin(),
          body: {
            title: `${tag} ${key}`,
            artist: 'Filter Test Artist',
            category: 'Concert',
            status: 'On Sale',
            venue: f.venue,
            province: f.province,
            rounds: [{ date: f.date, time: '19:00' }],
            zones: [{ name: 'Std', color: '#1D56CF', price: f.price, rows: 2, cols: 4 }]
          }
        });
        assert.strictEqual(res.status, 201, `fixture ${key} must be created`);
        created[key] = res.data.event;
      }
    });

    it('Province is stored on create and returned by GET /api/events/:id', async () => {
      assert.strictEqual(created.A.province, 'Chiang Mai');
      const res = await request(`/api/events/${created.C.id}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.event.province, 'Phuket');
    });

    it('?province= returns only events of that province (case-insensitive, exact match)', async () => {
      const res = await request(`/api/events?province=Chiang Mai&search=${tag}`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(titlesOf(res).sort(), ['A', 'B']);

      const lower = await request(`/api/events?province=chiang mai&search=${tag}`);
      assert.deepStrictEqual(titlesOf(lower).sort(), ['A', 'B']);

      // Without the search tag, every returned event must still belong to the province
      const all = await request('/api/events?province=Phuket');
      assert.strictEqual(all.status, 200);
      assert.ok(all.data.events.length >= 1);
      assert.ok(all.data.events.every((e) => (e.province || '').toLowerCase() === 'phuket'));

      // Partial province name is NOT an exact match
      const partial = await request(`/api/events?province=Chiang&search=${tag}`);
      assert.strictEqual(partial.data.events.length, 0);
    });

    it('?location= matches province or venue by partial text', async () => {
      const byVenue = await request(`/api/events?location=patong&search=${tag}`);
      assert.deepStrictEqual(titlesOf(byVenue), ['C']);

      const byProvince = await request(`/api/events?location=chiang&search=${tag}`);
      assert.deepStrictEqual(titlesOf(byProvince).sort(), ['A', 'B']);
    });

    it('?month=YYYY-MM returns only events having a round in that month', async () => {
      const res = await request(`/api/events?month=2027-03&search=${tag}`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(titlesOf(res).sort(), ['A', 'C']);

      const april = await request(`/api/events?month=2027-04&search=${tag}`);
      assert.deepStrictEqual(titlesOf(april), ['B']);

      const none = await request(`/api/events?month=2027-12&search=${tag}`);
      assert.strictEqual(none.status, 200);
      assert.strictEqual(none.data.total, 0);
      assert.deepStrictEqual(none.data.events, []);
    });

    it('?month=MM (any year) matches on the month number only', async () => {
      const res = await request('/api/events?month=3');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.events.length >= 2);
      for (const e of res.data.events) {
        assert.ok(
          e.rounds.some((r) => r.date.split('-')[1] === '03'),
          `${e.id} must have a round in March`
        );
      }
      const ids = res.data.events.map((e) => e.id);
      assert.ok(ids.includes(created.A.id) && ids.includes(created.C.id));
      assert.ok(!ids.includes(created.B.id));
    });

    it('Combines province + month + category filters (AND logic)', async () => {
      const res = await request(`/api/events?province=Chiang Mai&month=2027-03&category=Concert&search=${tag}`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(titlesOf(res), ['A']);
    });

    it('?sort=price_asc / price_desc orders by lowest zone price', async () => {
      const asc = await request(`/api/events?sort=price_asc&search=${tag}`);
      assert.strictEqual(asc.status, 200);
      assert.deepStrictEqual(titlesOf(asc), ['C', 'A', 'B']); // 200, 500, 900

      const desc = await request(`/api/events?sort=price_desc&search=${tag}`);
      assert.deepStrictEqual(titlesOf(desc), ['B', 'A', 'C']);

      // Global ordering over every event in the database
      const allAsc = await request('/api/events?sort=price_asc');
      const ascPrices = allAsc.data.events.map(minPrice);
      for (let i = 0; i < ascPrices.length - 1; i++) {
        assert.ok(ascPrices[i] <= ascPrices[i + 1], 'price_asc must be non-decreasing');
      }
      const allDesc = await request('/api/events?sort=price_desc');
      const descPrices = allDesc.data.events.map(minPrice);
      for (let i = 0; i < descPrices.length - 1; i++) {
        assert.ok(descPrices[i] >= descPrices[i + 1], 'price_desc must be non-increasing');
      }
    });

    it('Sort is applied after filtering (province + price_desc)', async () => {
      const res = await request(`/api/events?province=Chiang Mai&sort=price_desc&search=${tag}`);
      assert.deepStrictEqual(titlesOf(res), ['B', 'A']);
    });

    it('Rejects invalid sort and month values with HTTP 400', async () => {
      const badSort = await request('/api/events?sort=price_sideways');
      assert.strictEqual(badSort.status, 400);
      assert.ok(typeof badSort.data.error === 'string' && badSort.data.error.length > 0);

      for (const bad of ['13', '0', '2027-13', '2027-3', 'march']) {
        const res = await request(`/api/events?month=${bad}`);
        assert.strictEqual(res.status, 400, `month=${bad} must be rejected`);
      }
    });

    it('Empty filter values are ignored (no filtering, HTTP 200)', async () => {
      const base = await request(`/api/events?search=${tag}`);
      const blank = await request(`/api/events?search=${tag}&province=&month=&sort=&location=`);
      assert.strictEqual(blank.status, 200);
      assert.strictEqual(blank.data.total, base.data.total);
      assert.strictEqual(blank.data.total, 3);
    });

    it('Admin can change province with PUT and the filter reflects it', async () => {
      const upd = await request(`/api/events/${created.B.id}`, {
        method: 'PUT',
        headers: authAdmin(),
        body: { province: 'Chiang Rai' }
      });
      assert.strictEqual(upd.status, 200);
      assert.strictEqual(upd.data.event.province, 'Chiang Rai');

      const oldProv = await request(`/api/events?province=Chiang Mai&search=${tag}`);
      assert.deepStrictEqual(titlesOf(oldProv), ['A']);
      const newProv = await request(`/api/events?province=Chiang Rai&search=${tag}`);
      assert.deepStrictEqual(titlesOf(newProv), ['B']);
    });

    it('Rejects a non-string province on create and update with HTTP 400', async () => {
      const bad = await request('/api/events', {
        method: 'POST',
        headers: authAdmin(),
        body: {
          title: `${tag} BAD`,
          category: 'Concert',
          venue: 'X',
          province: 12345,
          rounds: [{ date: '2027-05-01', time: '19:00' }],
          zones: [{ name: 'Std', price: 100, rows: 1, cols: 2 }]
        }
      });
      assert.strictEqual(bad.status, 400);
      assert.match(bad.data.error, /province/i);

      const badUpdate = await request(`/api/events/${created.A.id}`, {
        method: 'PUT',
        headers: authAdmin(),
        body: { province: ['Chiang Mai'] }
      });
      assert.strictEqual(badUpdate.status, 400);
    });
  });

  describe('Admin-managed event categories', () => {
    const categoryName = `Workshop ${Date.now()}`;
    const adminHeaders = () => ({ Authorization: `Bearer ${adminToken}` });

    it('lists default categories publicly and restricts category creation to admins', async () => {
      const list = await request('/api/categories');
      assert.strictEqual(list.status, 200);
      assert.ok(list.data.categories.some((category) => category.name === 'Concert'));

      const unauthorized = await request('/api/categories', {
        method: 'POST',
        body: { name: categoryName }
      });
      assert.strictEqual(unauthorized.status, 401);

      const staffRequest = await request('/api/categories', {
        method: 'POST',
        headers: { Authorization: `Bearer ${staffToken}` },
        body: { name: categoryName }
      });
      assert.strictEqual(staffRequest.status, 403);
    });

    it('lets an admin create a category and use it for an event', async () => {
      const created = await request('/api/categories', {
        method: 'POST',
        headers: adminHeaders(),
        body: { name: categoryName }
      });
      assert.strictEqual(created.status, 201);
      assert.strictEqual(created.data.category.name, categoryName);

      const duplicate = await request('/api/categories', {
        method: 'POST',
        headers: adminHeaders(),
        body: { name: categoryName.toLowerCase() }
      });
      assert.strictEqual(duplicate.status, 409);

      const event = await request('/api/events', {
        method: 'POST',
        headers: adminHeaders(),
        body: {
          title: `Category test ${Date.now()}`,
          category: categoryName,
          status: 'On Sale',
          venue: 'Test Hall',
          province: 'Bangkok',
          rounds: [{ date: '2027-05-01', time: '19:00' }],
          zones: [{ name: 'Standard', price: 500, rows: 1, cols: 2 }]
        }
      });
      assert.strictEqual(event.status, 201);
      assert.strictEqual(event.data.event.category, categoryName);
    });

    it('rejects invalid category names and event categories that were not created', async () => {
      const empty = await request('/api/categories', {
        method: 'POST',
        headers: adminHeaders(),
        body: { name: '   ' }
      });
      assert.strictEqual(empty.status, 400);

      const event = await request('/api/events', {
        method: 'POST',
        headers: adminHeaders(),
        body: {
          title: 'Unregistered category test',
          category: 'Not Created',
          venue: 'Test Hall',
          province: 'Bangkok',
          rounds: [{ date: '2027-05-01', time: '19:00' }],
          zones: [{ name: 'Standard', price: 500, rows: 1, cols: 2 }]
        }
      });
      assert.strictEqual(event.status, 400);
      assert.match(event.data.error, /category/i);
    });
  });

  // =========================================================================
  // Suite 13: Booking Access Control & Booking History (FR-23, FR-32)
  // =========================================================================
  describe('Suite 13: Booking Access Control & Booking History (FR-23, FR-32)', () => {
    it('Holding seats without authentication returns HTTP 401', async () => {
      const res = await request('/api/bookings/hold', {
        method: 'POST',
        body: {
          eventId: 'evt-1',
          roundId: 'rnd-1a',
          seatIds: ['seat-evt-1-rnd-1a-zone-vip-B3']
        }
      });
      assert.strictEqual(res.status, 401);
    });

    it('Booking history requires authentication (HTTP 401)', async () => {
      const res = await request('/api/tickets/history');
      assert.strictEqual(res.status, 401);
    });

    it('History lists the customer\'s paid booking with status PAID', async () => {
      const res = await request('/api/tickets/history', {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert.strictEqual(res.status, 200);
      const paid = res.data.history.find((b) => b.id === paidBookingId);
      assert.ok(paid, 'paid booking must appear in history');
      assert.strictEqual(paid.status, 'PAID');
    });

    it('History is private: a brand-new customer sees none of another user\'s bookings', async () => {
      const ts = Date.now();
      const reg = await request('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'History Isolation User',
          email: `history.isolation.${ts}@example.com`,
          password: 'Password123!',
          phone: '0833333333',
          nationalId: `110070${ts.toString().slice(-7)}`
        }
      });
      assert.strictEqual(reg.status, 201);

      const res = await request('/api/tickets/history', {
        headers: { Authorization: `Bearer ${reg.data.token}` }
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.history));
      assert.strictEqual(res.data.history.length, 0);
      assert.ok(!res.data.history.some((b) => b.id === paidBookingId));
    });
  });

  // =========================================================================
  // Suite 14: Google & Facebook Social Login (FR-01)
  // Provider verification is stubbed (no real Google/Facebook calls are made);
  // the controller logic around it is exercised end-to-end over HTTP.
  // =========================================================================
  describe('Suite 14: Google & Facebook Social Login (FR-01)', () => {
    const ts = Date.now();
    const profiles = {
      'g-new': { provider: 'gmail', providerId: `g-${ts}`, email: `social.g.${ts}@gmail.com`, emailVerified: true, name: 'Gina Google', avatarUrl: '' },
      'g-unverified': { provider: 'gmail', providerId: `gu-${ts}`, email: `unverified.${ts}@gmail.com`, emailVerified: false, name: 'Una Verified', avatarUrl: '' },
      'g-admin-email': { provider: 'gmail', providerId: `ga-${ts}`, email: 'admin@ticket.com', emailVerified: true, name: 'Not Admin', avatarUrl: '' },
      'g-local-email': { provider: 'gmail', providerId: `gl-${ts}`, email: 'user@ticket.com', emailVerified: true, name: 'Not Chanita', avatarUrl: '' },
      'g-facebook-email': { provider: 'gmail', providerId: `gf-${ts}`, email: `social.fb.${ts}@example.com`, emailVerified: true, name: 'Fon Google', avatarUrl: '' },
      'fb-no-email': { provider: 'facebook', providerId: `fb-${ts}`, email: null, emailVerified: false, name: 'Fai Facebook', avatarUrl: '' },
      'fb-with-email': { provider: 'facebook', providerId: `fb2-${ts}`, email: `social.fb.${ts}@example.com`, emailVerified: true, name: 'Fon Facebook', avatarUrl: '' }
    };
    let originalVerify;
    let googleUserId = '';
    const envBackup = {};

    before(() => {
      for (const k of ['GOOGLE_CLIENT_ID', 'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET']) envBackup[k] = process.env[k];
      process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
      process.env.FACEBOOK_APP_ID = 'test-fb-app-id';
      process.env.FACEBOOK_APP_SECRET = 'test-fb-app-secret-DO-NOT-LEAK';

      originalVerify = socialAuth.verifyProviderToken;
      socialAuth.verifyProviderToken = async (provider, token) => {
        if (token === 'provider-down') throw new socialAuth.SocialAuthError('Google login is not configured on this server.', 503);
        const p = profiles[token];
        if (!p || p.provider !== provider) throw new socialAuth.SocialAuthError('Invalid token.', 401);
        return { ...p };
      };
    });

    after(() => {
      socialAuth.verifyProviderToken = originalVerify;
      for (const [k, v] of Object.entries(envBackup)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });

    const loginWith = (body) => request('/api/auth/social-login', { method: 'POST', body });

    it('GET /api/auth/social-config exposes only public IDs and never the Facebook app secret', async () => {
      const res = await request('/api/auth/social-config');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.google.enabled, true);
      assert.strictEqual(res.data.google.clientId, 'test-google-client-id.apps.googleusercontent.com');
      assert.strictEqual(res.data.facebook.enabled, true);
      assert.strictEqual(res.data.facebook.appId, 'test-fb-app-id');
      assert.ok(!JSON.stringify(res.data).includes('DO-NOT-LEAK'));
    });

    it('SECURITY: the old simulated payload (provider + email/name, no token) is rejected with 400', async () => {
      const res = await loginWith({ provider: 'gmail', email: 'admin@ticket.com', name: 'Hacker' });
      assert.strictEqual(res.status, 400);
      assert.ok(!res.data.token);

      const fb = await loginWith({ provider: 'facebook', identifier: 'fb_user_12345', name: 'Hacker' });
      assert.strictEqual(fb.status, 400);
    });

    it('Invalid provider token returns 401, and a token for the other provider is rejected', async () => {
      const bad = await loginWith({ provider: 'gmail', idToken: 'totally-invalid' });
      assert.strictEqual(bad.status, 401);
      assert.ok(!bad.data.token);

      const mismatch = await loginWith({ provider: 'facebook', accessToken: 'g-new' });
      assert.strictEqual(mismatch.status, 401);
    });

    it('Provider configuration error is surfaced as 503', async () => {
      const res = await loginWith({ provider: 'gmail', idToken: 'provider-down' });
      assert.strictEqual(res.status, 503);
    });

    it('Google: first login creates a customer from the verified token, ignoring email/name in the body', async () => {
      const res = await loginWith({ provider: 'google', idToken: 'g-new', email: 'admin@ticket.com', name: 'IGNORED' });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.token);
      assert.strictEqual(res.data.isNewUser, true);
      assert.strictEqual(res.data.user.email, profiles['g-new'].email);
      assert.strictEqual(res.data.user.name, 'Gina Google');
      assert.strictEqual(res.data.user.authProvider, 'gmail');
      assert.strictEqual(res.data.user.role, 'customer');
      assert.strictEqual(res.data.user.passwordHash, undefined);
      assert.ok(res.setCookie && res.setCookie.includes('HttpOnly'));
      googleUserId = res.data.user.id;

      // The issued JWT is accepted by protected routes
      const me = await request('/api/auth/profile', { headers: { Authorization: `Bearer ${res.data.token}` } });
      assert.strictEqual(me.status, 200);
      assert.strictEqual(me.data.user.id, googleUserId);
    });

    it('Google: second login with the same Google account reuses the same user', async () => {
      const res = await loginWith({ provider: 'gmail', idToken: 'g-new' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.isNewUser, false);
      assert.strictEqual(res.data.user.id, googleUserId);
      assert.strictEqual(res.data.user.points, 100);
    });

    it('Facebook: account without an email address gets a placeholder email and can log in again', async () => {
      const first = await loginWith({ provider: 'facebook', accessToken: 'fb-no-email' });
      assert.strictEqual(first.status, 200);
      assert.strictEqual(first.data.isNewUser, true);
      assert.strictEqual(first.data.user.authProvider, 'facebook');
      assert.match(first.data.user.email, /\.invalid$/);

      const again = await loginWith({ provider: 'facebook', accessToken: 'fb-no-email' });
      assert.strictEqual(again.data.user.id, first.data.user.id);
      assert.strictEqual(again.data.isNewUser, false);
    });

    it('Facebook: account with an email uses the email returned by Facebook', async () => {
      const res = await loginWith({ provider: 'facebook', accessToken: 'fb-with-email' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.user.email, profiles['fb-with-email'].email);
    });

    it('links a verified Google login to an existing customer Facebook account with the same email', async () => {
      const facebook = await loginWith({ provider: 'facebook', accessToken: 'fb-with-email' });
      const google = await loginWith({ provider: 'gmail', idToken: 'g-facebook-email' });
      assert.strictEqual(google.status, 200);
      assert.strictEqual(google.data.isNewUser, false);
      assert.strictEqual(google.data.user.id, facebook.data.user.id);

      const googleAgain = await loginWith({ provider: 'gmail', idToken: 'g-facebook-email' });
      assert.strictEqual(googleAgain.status, 200);
      assert.strictEqual(googleAgain.data.user.id, facebook.data.user.id);
    });

    it('Rejects a provider email that is not verified (403)', async () => {
      const res = await loginWith({ provider: 'gmail', idToken: 'g-unverified' });
      assert.strictEqual(res.status, 403);
      assert.ok(!res.data.token);
    });

    it('SECURITY: a social account can never take over an admin or password (local) account via its email', async () => {
      const admin = await loginWith({ provider: 'gmail', idToken: 'g-admin-email' });
      assert.strictEqual(admin.status, 403);
      assert.ok(!admin.data.token);

      const local = await loginWith({ provider: 'gmail', idToken: 'g-local-email' });
      assert.strictEqual(local.status, 403);
      assert.ok(!local.data.token);
    });

    it('SECURITY: social login is blocked once the account has been promoted to staff', async () => {
      store.update('users', googleUserId, { role: 'staff' });
      const res = await loginWith({ provider: 'gmail', idToken: 'g-new' });
      assert.strictEqual(res.status, 403);
      assert.ok(!res.data.token);
      store.update('users', googleUserId, { role: 'customer' });
    });
  });

  // =========================================================================
  // Suite 15: Provider token verification (calls to Google / Facebook are faked)
  // =========================================================================
  describe('Suite 15: Social Token Verification Service (Google & Facebook)', () => {
    const GOOGLE_URL = 'https://oauth2.googleapis.com/tokeninfo';
    const FB_DEBUG_URL = 'https://graph.facebook.com/v27.0/debug_token';
    const FB_ME_URL = 'https://graph.facebook.com/v27.0/me';
    const envBackup = {};

    const goodGoogle = () => ({
      sub: 'g-123',
      aud: 'unit-google-client',
      iss: 'https://accounts.google.com',
      exp: String(Math.floor(Date.now() / 1000) + 600),
      email: 'Person@Gmail.com',
      email_verified: 'true',
      name: 'Person One',
      picture: 'https://lh3.googleusercontent.com/a/photo'
    });

    /** Replaces global fetch only for the duration of fn(), so the HTTP test helper is never affected. */
    async function withFakeFetch(routes, fn) {
      const original = global.fetch;
      global.fetch = async (url) => {
        const key = Object.keys(routes).find((k) => String(url).startsWith(k));
        if (!key) throw new Error(`unexpected fetch: ${url}`);
        const r = routes[key];
        return { ok: r.ok !== false, json: async () => r.data };
      };
      try {
        return await fn();
      } finally {
        global.fetch = original;
      }
    }

    const rejects = async (promiseFn, status) => {
      await assert.rejects(promiseFn, (err) => err instanceof socialAuth.SocialAuthError && err.status === status);
    };

    before(() => {
      for (const k of ['GOOGLE_CLIENT_ID', 'FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET']) envBackup[k] = process.env[k];
      process.env.GOOGLE_CLIENT_ID = 'unit-google-client';
      process.env.FACEBOOK_APP_ID = 'unit-fb-app';
      process.env.FACEBOOK_APP_SECRET = 'unit-fb-secret';
    });

    after(() => {
      for (const [k, v] of Object.entries(envBackup)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });

    it('Google: accepts a valid ID token and normalises the profile', async () => {
      const p = await withFakeFetch({ [GOOGLE_URL]: { data: goodGoogle() } }, () => socialAuth.verifyGoogleIdToken('tok'));
      assert.strictEqual(p.provider, 'gmail');
      assert.strictEqual(p.providerId, 'g-123');
      assert.strictEqual(p.email, 'person@gmail.com');
      assert.strictEqual(p.emailVerified, true);
    });

    it('Google: rejects wrong audience, wrong issuer, expired and invalid tokens (401)', async () => {
      const cases = [
        { ...goodGoogle(), aud: 'someone-elses-client' },
        { ...goodGoogle(), iss: 'https://evil.example.com' },
        { ...goodGoogle(), exp: '1' }
      ];
      for (const data of cases) {
        await rejects(() => withFakeFetch({ [GOOGLE_URL]: { data } }, () => socialAuth.verifyGoogleIdToken('tok')), 401);
      }
      await rejects(
        () => withFakeFetch({ [GOOGLE_URL]: { ok: false, data: { error: 'invalid_token' } } }, () => socialAuth.verifyGoogleIdToken('tok')),
        401
      );
    });

    it('Google: returns 503 when GOOGLE_CLIENT_ID is not configured and 502 when Google is unreachable', async () => {
      process.env.GOOGLE_CLIENT_ID = '';
      await rejects(() => socialAuth.verifyGoogleIdToken('tok'), 503);
      process.env.GOOGLE_CLIENT_ID = 'unit-google-client';
      await rejects(() => withFakeFetch({}, () => socialAuth.verifyGoogleIdToken('tok')), 502);
    });

    it('Facebook: accepts a valid token for this app and returns the profile', async () => {
      const routes = {
        [FB_DEBUG_URL]: { data: { data: { is_valid: true, app_id: 'unit-fb-app', user_id: 'fb-1' } } },
        [FB_ME_URL]: { data: { id: 'fb-1', name: 'Fai', email: 'Fai@Example.com' } }
      };
      const p = await withFakeFetch(routes, () => socialAuth.verifyFacebookAccessToken('tok'));
      assert.strictEqual(p.provider, 'facebook');
      assert.strictEqual(p.providerId, 'fb-1');
      assert.strictEqual(p.email, 'fai@example.com');
      assert.strictEqual(p.emailVerified, true);
    });

    it('Facebook: rejects tokens from another app, invalid tokens, and user/profile mismatches (401)', async () => {
      const me = { data: { id: 'fb-1', name: 'Fai' } };
      const bad = [
        { data: { data: { is_valid: true, app_id: 'another-app', user_id: 'fb-1' } } },
        { data: { data: { is_valid: false } } },
        { data: { data: { is_valid: true, app_id: 'unit-fb-app', user_id: 'someone-else' } } }
      ];
      for (const debug of bad) {
        await rejects(
          () => withFakeFetch({ [FB_DEBUG_URL]: debug, [FB_ME_URL]: me }, () => socialAuth.verifyFacebookAccessToken('tok')),
          401
        );
      }
    });

    it('Facebook: profile without an email is returned as unverified/no email', async () => {
      const routes = {
        [FB_DEBUG_URL]: { data: { data: { is_valid: true, app_id: 'unit-fb-app', user_id: 'fb-9' } } },
        [FB_ME_URL]: { data: { id: 'fb-9', name: 'No Mail' } }
      };
      const p = await withFakeFetch(routes, () => socialAuth.verifyFacebookAccessToken('tok'));
      assert.strictEqual(p.email, null);
      assert.strictEqual(p.emailVerified, false);
    });
  });
});