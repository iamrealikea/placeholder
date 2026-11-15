const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-api-data-'));
const tmpUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-api-uploads-'));
process.env.DATA_DIR = tmpDataDir;
process.env.UPLOAD_DIR = tmpUploadDir;
process.env.NODE_ENV = 'test';

const { app, expirationInterval } = require('../../server');
const { store, SeatModel } = require('../../src/models');
const { generateSeedData } = require('../../src/store/seed');

describe('TicketHub REST API E2E Integration Tests', () => {
  let server;
  let baseUrl;
  let customerToken;
  let adminToken;
  let staffToken;
  let secondUserToken;
  let adminUserId;
  let staffUserId;
  let createdEventId;
  let activeBookingId;
  let checkedInTicketCode;
  let cancelBookingId;

  async function req(method, urlPath, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  }

  before(async () => {
    store.resetWithSeed(generateSeedData);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    clearInterval(expirationInterval);
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
    fs.rmSync(tmpUploadDir, { recursive: true, force: true });
  });

  it('IT-01: GET /api/health returns service status ok', async () => {
    const res = await req('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.system, 'TicketHub Platform');
  });

  it('IT-02: POST /api/auth/register creates customer and omits passwordHash', async () => {
    const res = await req('POST', '/api/auth/register', {
      body: {
        name: 'Alice Second',
        email: 'alice.second@example.com',
        password: 'password123',
        nationalId: '1100509998887',
        phone: '0891112222'
      }
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, 'alice.second@example.com');
    assert.equal(res.body.user.passwordHash, undefined);
    secondUserToken = res.body.token;
  });

  it('IT-03: POST /api/auth/register rejects duplicate email (400) and duplicate nationalId (409)', async () => {
    const dupEmail = await req('POST', '/api/auth/register', {
      body: { name: 'Dup', email: 'alice.second@example.com', password: 'password123' }
    });
    assert.equal(dupEmail.status, 400);

    const dupNid = await req('POST', '/api/auth/register', {
      body: { name: 'Dup NID', email: 'other.alice@example.com', password: 'password123', nationalId: '1100509998887' }
    });
    assert.equal(dupNid.status, 409);
  });

  it('IT-04: POST /api/auth/login authenticates customer, admin, and staff without leaking passwordHash', async () => {
    const cRes = await req('POST', '/api/auth/login', { body: { email: 'user@ticket.com', password: 'password123' } });
    const aRes = await req('POST', '/api/auth/login', { body: { email: 'admin@ticket.com', password: 'admin123' } });
    const sRes = await req('POST', '/api/auth/login', { body: { email: 'staff@ticket.com', password: 'staff123' } });

    for (const r of [cRes, aRes, sRes]) {
      assert.equal(r.status, 200);
      assert.ok(r.body.token);
      assert.equal(r.body.user.passwordHash, undefined);
    }
    customerToken = cRes.body.token;
    adminToken = aRes.body.token;
    staffToken = sRes.body.token;
    adminUserId = aRes.body.user.id;
    staffUserId = sRes.body.user.id;
  });

  it('IT-05: POST /api/auth/login rejects invalid credentials with 401', async () => {
    const res = await req('POST', '/api/auth/login', { body: { email: 'user@ticket.com', password: 'wrongpassword' } });
    assert.equal(res.status, 401);
  });

  it('IT-06: GET /api/auth/me & /profile return sanitized current user', async () => {
    const me = await req('GET', '/api/auth/me', { token: customerToken });
    const prof = await req('GET', '/api/auth/profile', { token: customerToken });
    assert.equal(me.status, 200);
    assert.equal(prof.status, 200);
    assert.equal(me.body.user.email, 'user@ticket.com');
    assert.equal(me.body.user.passwordHash, undefined);
  });

  it('IT-07: PUT /api/auth/profile updates editable profile fields cleanly', async () => {
    const res = await req('PUT', '/api/auth/profile', {
      token: customerToken,
      body: { name: 'Chanita Updated', phone: '0819998888', age: 22 }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.name, 'Chanita Updated');
    assert.equal(res.body.user.age, 22);
    assert.equal(res.body.user.passwordHash, undefined);
  });

  it('IT-08: GET /api/auth/social-config & POST /api/auth/social-login (phone demo) issue token', async () => {
    const cfg = await req('GET', '/api/auth/social-config');
    assert.equal(cfg.status, 200);
    assert.equal(cfg.body.phoneDemo, true);

    const loginRes = await req('POST', '/api/auth/social-login', {
      body: { provider: 'phone', phone: '0890001122', name: 'Phone Demo' }
    });
    assert.equal(loginRes.status, 200);
    assert.ok(loginRes.body.token);
    assert.equal(loginRes.body.user.passwordHash, undefined);
  });

  it('IT-09: Categories GET lists all and POST enforces admin RBAC', async () => {
    const listRes = await req('GET', '/api/categories');
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.categories.length >= 4);

    const forbidden = await req('POST', '/api/categories', { token: customerToken, body: { name: 'Sports' } });
    assert.equal(forbidden.status, 403);

    const created = await req('POST', '/api/categories', { token: adminToken, body: { name: 'Sports' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.category.name, 'Sports');
  });

  it('IT-10: GET /api/events filters by search, province, month, sort and validates bad query values', async () => {
    const filtered = await req('GET', '/api/events?search=Forza&province=Nonthaburi&month=2026-11&sort=price_asc');
    assert.equal(filtered.status, 200);
    assert.ok(filtered.body.events.some((e) => e.id === 'evt-1'));

    const badSort = await req('GET', '/api/events?sort=random');
    assert.equal(badSort.status, 400);

    const badMonth = await req('GET', '/api/events?month=2026-15');
    assert.equal(badMonth.status, 400);
  });

  it('IT-11: GET /api/events/:id returns event with zone availability and 404 when missing', async () => {
    const okRes = await req('GET', '/api/events/evt-1');
    assert.equal(okRes.status, 200);
    assert.ok(Array.isArray(okRes.body.event.rounds));

    const missing = await req('GET', '/api/events/evt-does-not-exist');
    assert.equal(missing.status, 404);
  });

  it('IT-12: POST /api/events/:id/bookmark toggles user bookmark on and off', async () => {
    const b1 = await req('POST', '/api/events/evt-2/bookmark', { token: customerToken });
    assert.equal(b1.status, 200);
    assert.equal(b1.body.isBookmarked, true);

    const b2 = await req('POST', '/api/events/evt-2/bookmark', { token: customerToken });
    assert.equal(b2.status, 200);
    assert.equal(b2.body.isBookmarked, false);
  });

  it('IT-13: GET /api/events/templates returns templates to admin (200) and rejects customer (403)', async () => {
    const deny = await req('GET', '/api/events/templates', { token: customerToken });
    assert.equal(deny.status, 403);

    const allow = await req('GET', '/api/events/templates', { token: adminToken });
    assert.equal(allow.status, 200);
    assert.equal(allow.body.templates.length, 3);
  });

  it('IT-14: Admin creates event (generates seats), updates event, and updates zone seating', async () => {
    const createRes = await req('POST', '/api/events', {
      token: adminToken,
      body: {
        title: 'API E2E Live Show',
        artist: 'Test Band',
        category: 'Concert',
        venue: 'E2E Arena',
        province: 'Bangkok',
        rounds: [{ id: 'rnd-e2e-1', date: '2026-12-10', time: '19:00' }],
        zones: [{ id: 'z-e2e-1', name: 'Main Floor', color: '#1D56CF', price: 2000, rows: 2, cols: 4 }]
      }
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.totalSeatsGenerated, 8);
    createdEventId = createRes.body.event.id;

    const updRes = await req('PUT', `/api/events/${createdEventId}`, {
      token: adminToken,
      body: { title: 'API E2E Live Show (Revised)' }
    });
    assert.equal(updRes.status, 200);
    assert.equal(updRes.body.event.title, 'API E2E Live Show (Revised)');

    const seatUpd = await req('PUT', `/api/admin/events/${createdEventId}/seating`, {
      token: adminToken,
      body: { zones: [{ id: 'z-e2e-1', name: 'Main Floor VIP', color: '#FF0800', price: 2200, rows: 2, cols: 4 }] }
    });
    assert.equal(seatUpd.status, 200);
    assert.equal(seatUpd.body.zones[0].price, 2200);
  });

  it('IT-15: GET /api/bookings/events/:eventId/rounds/:roundId/seats returns seat layout', async () => {
    const res = await req('GET', `/api/bookings/events/${createdEventId}/rounds/rnd-e2e-1/seats`);
    assert.equal(res.status, 200);
    assert.equal(res.body.seats.length, 8);
    assert.ok(res.body.seats.every((s) => s.price === 2200));
  });

  it('IT-16: POST /api/bookings/hold enforces sale period restrictions with 403 (FR-49)', async () => {
    const seatsRes = await req('GET', '/api/bookings/events/evt-4/rounds/rnd-4a/seats');
    const firstSeat = seatsRes.body.seats[0];
    const holdRes = await req('POST', '/api/bookings/hold', {
      token: customerToken,
      body: { eventId: 'evt-4', roundId: 'rnd-4a', seatIds: [firstSeat.id] }
    });
    assert.equal(holdRes.status, 403);
  });

  it('IT-17: POST /api/bookings/hold rejects exceeding maxTicketsPerUser (400) or duplicate seatIds (400)', async () => {
    const seatsRes = await req('GET', `/api/bookings/events/${createdEventId}/rounds/rnd-e2e-1/seats`);
    const ids = seatsRes.body.seats.map((s) => s.id);

    const tooMany = await req('POST', '/api/bookings/hold', {
      token: customerToken,
      body: { eventId: createdEventId, roundId: 'rnd-e2e-1', seatIds: ids.slice(0, 7) }
    });
    assert.equal(tooMany.status, 400);

    const dup = await req('POST', '/api/bookings/hold', {
      token: customerToken,
      body: { eventId: createdEventId, roundId: 'rnd-e2e-1', seatIds: [ids[0], ids[0]] }
    });
    assert.equal(dup.status, 400);
  });

  it('IT-18: POST /api/bookings/hold locks selected seats for 10 minutes with 40 THB service fee per ticket', async () => {
    const seatsRes = await req('GET', `/api/bookings/events/${createdEventId}/rounds/rnd-e2e-1/seats`);
    const targetIds = seatsRes.body.seats.slice(0, 2).map((s) => s.id);

    const holdRes = await req('POST', '/api/bookings/hold', {
      token: customerToken,
      body: { eventId: createdEventId, roundId: 'rnd-e2e-1', seatIds: targetIds }
    });
    assert.equal(holdRes.status, 201);
    assert.equal(holdRes.body.booking.status, 'PENDING');
    assert.equal(holdRes.body.booking.serviceFee, 80);
    assert.equal(holdRes.body.booking.totalAmount, 2200 * 2 + 80);
    activeBookingId = holdRes.body.booking.id;
  });

  it('IT-19: POST /api/bookings/hold prevents double-booking held seat with 409 Conflict (FR-23, NFR-08)', async () => {
    const seatsRes = await req('GET', `/api/bookings/events/${createdEventId}/rounds/rnd-e2e-1/seats`);
    const heldSeat = seatsRes.body.seats.find((s) => s.bookingId === activeBookingId);

    const concurrent = await req('POST', '/api/bookings/hold', {
      token: secondUserToken,
      body: { eventId: createdEventId, roundId: 'rnd-e2e-1', seatIds: [heldSeat.id] }
    });
    assert.equal(concurrent.status, 409);
  });

  it('IT-20: Expired seat holds auto-release back to AVAILABLE when queried', async () => {
    const seatsRes = await req('GET', `/api/bookings/events/${createdEventId}/rounds/rnd-e2e-1/seats`);
    const freeSeat = seatsRes.body.seats.find((s) => s.status === 'AVAILABLE');

    const holdRes = await req('POST', '/api/bookings/hold', {
      token: secondUserToken,
      body: { eventId: createdEventId, roundId: 'rnd-e2e-1', seatIds: [freeSeat.id] }
    });
    assert.equal(holdRes.status, 201);

    // Backdate hold expiration in shared test store
    const [seatRecord] = SeatModel.findByIds([freeSeat.id]);
    seatRecord.holdExpiresAt = new Date(Date.now() - 10000).toISOString();

    const afterSeats = await req('GET', `/api/bookings/events/${createdEventId}/rounds/rnd-e2e-1/seats`);
    const released = afterSeats.body.seats.find((s) => s.id === freeSeat.id);
    assert.equal(released.status, 'AVAILABLE');
  });

  it('IT-21: GET /api/bookings/:id/summary returns breakdown to owner and denies non-owner (403)', async () => {
    const ownerRes = await req('GET', `/api/bookings/${activeBookingId}/summary`, { token: customerToken });
    assert.equal(ownerRes.status, 200);
    assert.ok(ownerRes.body.remainingSeconds > 0);

    const otherRes = await req('GET', `/api/bookings/${activeBookingId}/summary`, { token: secondUserToken });
    assert.equal(otherRes.status, 403);
  });

  it('IT-22: POST /api/bookings/:id/apply-discount applies promo TICKETHUB10 and points redemption', async () => {
    const res = await req('POST', `/api/bookings/${activeBookingId}/apply-discount`, {
      token: customerToken,
      body: { promoCode: 'TICKETHUB10', redeemPoints: 100 }
    });
    assert.equal(res.status, 200);
    // 10% of 4400 = 440 + 100 pts (10 THB) = 450 discount; total = 4400 - 450 + 80 = 4030
    assert.equal(res.body.booking.discountAmount, 450);
    assert.equal(res.body.booking.totalAmount, 4030);
  });

  it('IT-23: POST /api/bookings/:id/pay rejects simulated gateway failure with 400 and keeps PENDING state', async () => {
    const failRes = await req('POST', `/api/bookings/${activeBookingId}/pay`, {
      token: customerToken,
      body: { paymentMethod: 'PROMPTPAY', paymentDetails: { simulateFailure: true } }
    });
    assert.equal(failRes.status, 400);

    const summary = await req('GET', `/api/bookings/${activeBookingId}/summary`, { token: customerToken });
    assert.equal(summary.body.booking.status, 'PENDING');
  });

  it('IT-24: POST /api/bookings/:id/pay completes payment, marks seats BOOKED, and issues QR tickets', async () => {
    const payRes = await req('POST', `/api/bookings/${activeBookingId}/pay`, {
      token: customerToken,
      body: { paymentMethod: 'PROMPTPAY', ticketHolderNames: ['Chanita A', 'Friend B'] }
    });
    assert.equal(payRes.status, 200);
    assert.equal(payRes.body.payment.status, 'SUCCESS');
    assert.equal(payRes.body.tickets.length, 2);
    assert.ok(payRes.body.tickets[0].qrDataUrl.startsWith('data:image/png;base64,'));
    checkedInTicketCode = payRes.body.tickets[0].ticketCode;
  });

  it('IT-25: GET /api/tickets/my & /history list customer QR tickets and payment records', async () => {
    const myRes = await req('GET', '/api/tickets/my', { token: customerToken });
    const histRes = await req('GET', '/api/tickets/history', { token: customerToken });
    assert.equal(myRes.status, 200);
    assert.equal(histRes.status, 200);
    assert.ok(myRes.body.tickets.some((t) => t.ticketCode === checkedInTicketCode));
    assert.ok(histRes.body.history.some((h) => h.id === activeBookingId && h.payment?.status === 'SUCCESS'));
  });

  it('IT-26: POST /api/tickets/validate enforces staff/admin RBAC (403) and returns 404 for unknown ticket', async () => {
    const deny = await req('POST', '/api/tickets/validate', {
      token: customerToken,
      body: { ticketCode: checkedInTicketCode }
    });
    assert.equal(deny.status, 403);

    const missing = await req('POST', '/api/tickets/validate', {
      token: staffToken,
      body: { ticketCode: 'TKT-FAKE-9999' }
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.reason, 'INVALID_TICKET');
  });

  it('IT-27: POST /api/tickets/validate checks in a valid ticket once (FR-30)', async () => {
    const okRes = await req('POST', '/api/tickets/validate', {
      token: staffToken,
      body: { ticketCode: checkedInTicketCode }
    });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.body.valid, true);
    assert.equal(okRes.body.ticket.status, 'CHECKED_IN');
  });

  it('IT-28: POST /api/tickets/validate rejects duplicate check-in with 400 ALREADY_CHECKED_IN (FR-31)', async () => {
    const reuseRes = await req('POST', '/api/tickets/validate', {
      token: staffToken,
      body: { ticketCode: checkedInTicketCode }
    });
    assert.equal(reuseRes.status, 400);
    assert.equal(reuseRes.body.reason, 'ALREADY_CHECKED_IN');
  });

  it('IT-29: POST /api/bookings/:id/cancel blocks cancelling a booking after ticket check-in (400)', async () => {
    const cancelRes = await req('POST', `/api/bookings/${activeBookingId}/cancel`, { token: customerToken });
    assert.equal(cancelRes.status, 400);
  });

  it('IT-30: POST /api/bookings/:id/cancel refunds paid un-scanned booking while retaining 40 THB/ticket fee (FR-39)', async () => {
    const seatsRes = await req('GET', `/api/bookings/events/${createdEventId}/rounds/rnd-e2e-1/seats`);
    const availSeats = seatsRes.body.seats.filter((s) => s.status === 'AVAILABLE').slice(0, 2);

    const hold = await req('POST', '/api/bookings/hold', {
      token: secondUserToken,
      body: { eventId: createdEventId, roundId: 'rnd-e2e-1', seatIds: availSeats.map((s) => s.id) }
    });
    cancelBookingId = hold.body.booking.id;

    const pay = await req('POST', `/api/bookings/${cancelBookingId}/pay`, {
      token: secondUserToken,
      body: { paymentMethod: 'PROMPTPAY' }
    });
    assert.equal(pay.status, 200);
    const cancelledTicketCode = pay.body.tickets[0].ticketCode;

    const cancelRes = await req('POST', `/api/bookings/${cancelBookingId}/cancel`, { token: secondUserToken });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.nonRefundableFee, 80);
    assert.equal(cancelRes.body.refundableAmount, 4400);
    assert.equal(cancelRes.body.originalTotal, 4480);

    // Verify seats were released back to AVAILABLE
    const afterSeats = await req('GET', `/api/bookings/events/${createdEventId}/rounds/rnd-e2e-1/seats`);
    for (const s of availSeats) {
      assert.equal(afterSeats.body.seats.find((x) => x.id === s.id).status, 'AVAILABLE');
    }

    // Store cancelled ticket code for IT-31
    cancelBookingId = cancelledTicketCode;
  });

  it('IT-31: POST /api/tickets/validate rejects cancelled tickets with 400 CANCELLED_TICKET', async () => {
    const res = await req('POST', '/api/tickets/validate', {
      token: staffToken,
      body: { ticketCode: cancelBookingId }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.reason, 'CANCELLED_TICKET');
  });

  it('IT-32: Support endpoints allow customer submission and admin reply/resolution', async () => {
    const createRes = await req('POST', '/api/support', {
      token: customerToken,
      body: { subject: 'E2E Inquiry', category: 'Payment', message: 'Check receipt please' }
    });
    assert.equal(createRes.status, 201);
    const supId = createRes.body.support.id;

    const myRes = await req('GET', '/api/support/my', { token: customerToken });
    assert.ok(myRes.body.tickets.some((t) => t.id === supId));

    const allForbidden = await req('GET', '/api/support/all', { token: customerToken });
    assert.equal(allForbidden.status, 403);

    const allAdmin = await req('GET', '/api/support/all', { token: adminToken });
    assert.equal(allAdmin.status, 200);

    const replyRes = await req('PUT', `/api/support/${supId}/reply`, {
      token: adminToken,
      body: { reply: 'Receipt confirmed.' }
    });
    assert.equal(replyRes.status, 200);
    assert.equal(replyRes.body.support.status, 'RESOLVED');
  });

  it('IT-33: Notifications endpoints return user notifications and mark them as read', async () => {
    const listRes = await req('GET', '/api/notifications', { token: customerToken });
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.notifications.length >= 1);

    const targetId = listRes.body.notifications[0].id;
    const readRes = await req('PUT', `/api/notifications/${targetId}/read`, { token: customerToken });
    assert.equal(readRes.status, 200);
    assert.equal(readRes.body.notification.isRead, true);
  });

  it('IT-34: Admin dashboard, transactions, and backup/restore enforce RBAC and persist snapshots', async () => {
    assert.equal((await req('GET', '/api/admin/dashboard', { token: customerToken })).status, 403);

    const dash = await req('GET', '/api/admin/dashboard', { token: adminToken });
    assert.equal(dash.status, 200);
    assert.ok(dash.body.kpis.totalRevenue > 0);

    const tx = await req('GET', `/api/admin/transactions?eventId=${createdEventId}`, { token: adminToken });
    assert.equal(tx.status, 200);
    assert.ok(tx.body.transactions.length >= 1);

    const bkp = await req('POST', '/api/admin/backups', { token: adminToken, body: { label: 'e2e' } });
    assert.equal(bkp.status, 201);

    const bkpList = await req('GET', '/api/admin/backups', { token: adminToken });
    assert.ok(bkpList.body.backups.some((b) => b.backupId === bkp.body.backup.backupId));

    const restore = await req('POST', '/api/admin/backups/restore', {
      token: adminToken,
      body: { backupId: bkp.body.backup.backupId }
    });
    assert.equal(restore.status, 200);
  });

  it('IT-35: Admin user management enforces anti-self-demotion (400) and never leaks passwordHash', async () => {
    const usersRes = await req('GET', '/api/admin/users', { token: adminToken });
    assert.equal(usersRes.status, 200);
    assert.ok(usersRes.body.users.every((u) => u.passwordHash === undefined));

    const selfDemote = await req('PUT', `/api/admin/users/${adminUserId}/role`, {
      token: adminToken,
      body: { role: 'customer' }
    });
    assert.equal(selfDemote.status, 400);

    const roleUpd = await req('PUT', `/api/admin/users/${staffUserId}/role`, {
      token: adminToken,
      body: { role: 'admin' }
    });
    assert.equal(roleUpd.status, 200);
    assert.equal(roleUpd.body.user.role, 'admin');
    assert.equal(roleUpd.body.user.passwordHash, undefined);
  });
});
