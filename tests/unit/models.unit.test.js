const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-models-unit-'));
process.env.DATA_DIR = tmpDataDir;
process.env.NODE_ENV = 'test';

const {
  store,
  UserModel,
  EventModel,
  CategoryModel,
  SeatModel,
  BookingModel,
  PaymentModel,
  TicketModel,
  PromotionModel,
  NotificationModel,
  SupportModel
} = require('../../src/models');
const { generateSeedData } = require('../../src/store/seed');

describe('Data Structure Unit Tests (src/models)', () => {
  before(() => {
    store.resetWithSeed(generateSeedData);
  });

  after(() => {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  });

  // UT-DS-01
  it('UT-DS-01: UserModel lookup methods find by id, email, nationalId, phone and handle empty/missing inputs', () => {
    const all = UserModel.findAll();
    assert.ok(all.length >= 3);
    assert.equal(UserModel.findById('usr-customer-1')?.email, 'user@ticket.com');
    assert.equal(UserModel.findByEmail('  USER@TICKET.COM '), UserModel.findById('usr-customer-1'));
    assert.equal(UserModel.findByEmail(''), null);
    assert.equal(UserModel.findByNationalId(' 1100501234567 ')?.id, 'usr-customer-1');
    assert.equal(UserModel.findByNationalId(''), null);
    assert.equal(UserModel.findByPhone(' 0812345678 ')?.id, 'usr-customer-1');
    assert.equal(UserModel.findByPhone(''), null);
  });

  // UT-DS-02
  it('UT-DS-02: UserModel.findBySocialId locates gmail/facebook users and returns null on invalid provider or missing id', () => {
    const gUser = UserModel.create({
      name: 'Google User',
      email: 'guser@example.com',
      googleId: 'g-12345',
      facebookId: 'fb-999'
    });
    assert.equal(UserModel.findBySocialId('gmail', 'g-12345')?.id, gUser.id);
    assert.equal(UserModel.findBySocialId('facebook', 'fb-999')?.id, gUser.id);
    assert.equal(UserModel.findBySocialId('twitter', 'g-12345'), null);
    assert.equal(UserModel.findBySocialId('gmail', ''), null);
  });

  // UT-DS-03
  it('UT-DS-03: UserModel.create & update enforce defaults and persist field updates', () => {
    const created = UserModel.create({
      name: 'New Tester',
      email: 'new.tester@example.com',
      nationalId: '1999900001111',
      phone: '0800001111'
    });
    assert.ok(created.id.startsWith('usr-'));
    assert.equal(created.role, 'customer');
    assert.equal(created.points, 100);
    assert.deepEqual(created.bookmarks, []);

    const updated = UserModel.update(created.id, { name: 'Updated Tester', points: 250 });
    assert.equal(updated.id, created.id);
    assert.equal(updated.name, 'Updated Tester');
    assert.equal(updated.points, 250);
  });

  // UT-DS-04
  it('UT-DS-04: UserModel.toggleBookmark adds, removes, and returns null for unknown user', () => {
    const added = UserModel.toggleBookmark('usr-admin-1', 'evt-1');
    assert.equal(added.isBookmarked, true);
    assert.ok(added.bookmarks.includes('evt-1'));

    const removed = UserModel.toggleBookmark('usr-admin-1', 'evt-1');
    assert.equal(removed.isBookmarked, false);
    assert.ok(!removed.bookmarks.includes('evt-1'));

    assert.equal(UserModel.toggleBookmark('usr-missing', 'evt-1'), null);
  });

  // UT-DS-05
  it('UT-DS-05: UserModel.adjustPoints calculates net points, clamps floor at 0, and returns null for missing user', () => {
    const u = UserModel.create({ name: 'Points User', email: 'pts@example.com', points: 100 });
    const afterEarn = UserModel.adjustPoints(u.id, 30, 50);
    assert.equal(afterEarn.points, 120);

    const clamped = UserModel.adjustPoints(u.id, 999, 0);
    assert.equal(clamped.points, 0);
    assert.equal(UserModel.adjustPoints('usr-missing', 10, 10), null);
  });

  // UT-DS-06
  it('UT-DS-06: UserModel.getRoleCounts & filterUsers accurately tally and filter by role and search', () => {
    const counts = UserModel.getRoleCounts();
    assert.equal(counts.total, UserModel.findAll().length);
    assert.ok(counts.customer >= 1 && counts.staff >= 1 && counts.admin >= 1);

    const admins = UserModel.filterUsers({ role: 'admin', search: 'Sirawit' });
    assert.equal(admins.length, 1);
    assert.equal(admins[0].email, 'admin@ticket.com');
  });

  // UT-DS-07
  it('UT-DS-07: CategoryModel.findAll, findByName, create enforce case-insensitive uniqueness and sorting', () => {
    const list = CategoryModel.findAll();
    const names = list.map((c) => c.name);
    assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b)));

    assert.equal(CategoryModel.findByName(' concert ')?.name, 'Concert');
    assert.equal(CategoryModel.findByName(''), null);
    assert.equal(CategoryModel.findByName(null), null);

    const created = CategoryModel.create('  Theater  ');
    assert.equal(created.name, 'Theater');
    assert.equal(CategoryModel.create('theater'), null);
  });

  // UT-DS-08
  it('UT-DS-08: EventModel.findAll supports search, category, status, artist, date, province, location, month, featured, saleActive, and price sorts', () => {
    EventModel.create({
      title: 'Free Open Mic Night',
      artist: 'Acoustic Indie',
      category: 'Concert',
      status: 'On Sale',
      venue: 'Chiang Mai Hall',
      province: 'Chiang Mai',
      isFeatured: false,
      rounds: [{ id: 'rnd-cm-1', date: '2026-10-05', time: '20:00' }],
      zones: []
    });

    assert.ok(EventModel.findAll({ search: 'Forza' }).some((e) => e.id === 'evt-1'));
    assert.ok(EventModel.findAll({ category: 'seminar' }).every((e) => e.category === 'Seminar'));
    assert.ok(EventModel.findAll({ status: 'Coming Soon' }).every((e) => e.status === 'Coming Soon'));
    assert.ok(EventModel.findAll({ artist: 'Horizon' }).some((e) => e.id === 'evt-1'));
    assert.ok(EventModel.findAll({ date: '2026-11-11' }).some((e) => e.id === 'evt-1'));
    assert.ok(EventModel.findAll({ province: 'bangkok' }).every((e) => e.province === 'Bangkok'));
    assert.ok(EventModel.findAll({ location: 'impact' }).some((e) => e.id === 'evt-1'));
    assert.ok(EventModel.findAll({ month: '2026-11' }).some((e) => e.id === 'evt-1'));
    assert.ok(EventModel.findAll({ month: '11' }).some((e) => e.id === 'evt-1'));
    assert.equal(EventModel.findAll({ month: '99' }).length, 0);
    assert.ok(EventModel.findAll({ featured: 'true' }).every((e) => e.isFeatured === true));
    assert.ok(EventModel.findAll({ saleActive: 'true' }).every((e) => e.status === 'On Sale'));

    const asc = EventModel.findAll({ sort: 'price_asc' });
    const desc = EventModel.findAll({ sort: 'price_desc' });
    assert.equal(asc[asc.length - 1].title, 'Free Open Mic Night');
    assert.equal(desc[desc.length - 1].title, 'Free Open Mic Night');
    const pricedAsc = asc.map((e) => EventModel.getMinPrice(e)).filter((p) => p !== null);
    for (let i = 1; i < pricedAsc.length; i++) {
      assert.ok(pricedAsc[i] >= pricedAsc[i - 1]);
    }
  });

  // UT-DS-09
  it('UT-DS-09: EventModel static helpers validate months, compute min price, and check sale windows', () => {
    assert.deepEqual(EventModel.SORT_OPTIONS, ['price_asc', 'price_desc']);
    assert.equal(EventModel.isValidMonth('2026-11'), true);
    assert.equal(EventModel.isValidMonth('3'), true);
    assert.equal(EventModel.isValidMonth('2026-13'), false);
    assert.equal(EventModel.getMinPrice({ zones: [] }), null);
    assert.equal(EventModel.getMinPrice({ zones: [{ price: 2500 }, { price: 1200 }] }), 1200);

    const openEvt = {
      status: 'On Sale',
      saleStartAt: '2026-01-01T00:00:00.000Z',
      saleEndAt: '2027-01-01T00:00:00.000Z'
    };
    assert.equal(EventModel.isSaleOpen(null), false);
    assert.equal(EventModel.isSaleOpen(openEvt, new Date('2026-06-01T00:00:00.000Z')), true);
    assert.equal(EventModel.isSaleOpen(openEvt, new Date('2025-12-31T23:59:59.000Z')), false);
    assert.equal(EventModel.isSaleOpen({ ...openEvt, status: 'Sold Out' }, new Date('2026-06-01T00:00:00.000Z')), false);
  });

  // UT-DS-10
  it('UT-DS-10: EventModel.normalizeZone normalizes matrix & custom seats and merges existingZone fallbacks', () => {
    const existing = {
      id: 'z-existing',
      name: 'Old Name',
      color: '#112233',
      price: 1500,
      layout: 'custom',
      rows: 2,
      cols: 3,
      originX: 50,
      originY: 60,
      seats: [{ label: 'A1', x: 10, y: 20 }]
    };

    const merged = EventModel.normalizeZone({}, 0, existing);
    assert.equal(merged.id, 'z-existing');
    assert.equal(merged.name, 'Old Name');
    assert.equal(merged.price, 1500);
    assert.equal(merged.seats.length, 1);

    const custom = EventModel.normalizeZone({
      name: 'Custom VIP',
      price: 2000,
      seats: [{ seatNumber: 'V1', x: 100, y: 120, seatColor: '#FF0800', price: 2200 }]
    }, 1);
    assert.equal(custom.layout, 'custom');
    assert.deepEqual(custom.seats[0], { label: 'V1', x: 100, y: 120, color: '#FF0800', price: 2200 });
  });

  // UT-DS-11
  it('UT-DS-11: EventModel.create, findById, update, remove perform full event lifecycle CRUD', () => {
    const created = EventModel.create({
      title: 'Lifecycle Concert',
      category: 'Concert',
      venue: 'Hall 1',
      rounds: [{ date: '2026-12-01', time: '18:00' }],
      zones: [{ name: 'Main Zone', price: 1000, rows: 2, cols: 2 }]
    });
    assert.equal(EventModel.findById(created.id)?.title, 'Lifecycle Concert');

    const updated = EventModel.update(created.id, {
      id: 'ignored-id',
      title: 'Updated Concert',
      rounds: [{ id: 'rnd-1', date: '2026-12-02', time: '20:00' }],
      zones: [{ id: 'zone-1', name: 'Main Zone Updated', price: 1200 }]
    });
    assert.equal(updated.id, created.id);
    assert.equal(updated.title, 'Updated Concert');
    assert.equal(updated.zones[0].price, 1200);

    assert.equal(EventModel.remove(created.id), true);
    assert.equal(EventModel.findById(created.id), null);
  });

  // UT-DS-12
  it('UT-DS-12: SeatModel.generateForEvent builds matrix and custom seats queryable by event, round, and ids', () => {
    const evt = EventModel.create({
      title: 'Seat Test Show',
      category: 'Concert',
      venue: 'Test Venue',
      rounds: [{ id: 'r1', date: '2026-11-25', time: '19:00' }],
      zones: [
        { id: 'zm', name: 'Matrix', price: 1000, rows: 2, cols: 2, originX: 10, originY: 20 },
        {
          id: 'zc',
          name: 'Custom',
          price: 2000,
          seats: [{ label: 'V1', x: 50, y: 60, color: '#FF0800', price: 2500 }]
        }
      ]
    });
    const generated = SeatModel.generateForEvent(evt);
    assert.equal(generated.length, 5);
    assert.equal(SeatModel.findByEvent(evt.id).length, 5);
    assert.equal(SeatModel.findByEventAndRound(evt.id, 'r1').length, 5);

    const vSeat = generated.find((s) => s.seatNumber === 'V1');
    assert.equal(vSeat.price, 2500);
    assert.equal(vSeat.seatColor, '#FF0800');
    assert.equal(SeatModel.findByIds([vSeat.id]).length, 1);

    SeatModel.removeByEvent(evt.id);
    EventModel.remove(evt.id);
  });

  // UT-DS-13
  it('UT-DS-13: SeatModel.holdSeats, markBooked, releaseSeats transition seat states atomically', () => {
    const evt = EventModel.create({
      title: 'Hold Flow Event',
      category: 'Concert',
      venue: 'Arena',
      rounds: [{ id: 'r1', date: '2026-11-28', time: '19:00' }],
      zones: [{ id: 'z1', name: 'GA', price: 1500, rows: 1, cols: 2 }]
    });
    const seats = SeatModel.generateForEvent(evt);
    const futureIso = new Date(Date.now() + 600000).toISOString();

    SeatModel.holdSeats(seats, 'usr-customer-1', 'bkg-test-hold', futureIso);
    assert.ok(SeatModel.findByEvent(evt.id).every((s) => s.status === 'HELD' && s.bookingId === 'bkg-test-hold'));

    SeatModel.markBooked([seats[0].id]);
    assert.equal(SeatModel.findByIds([seats[0].id])[0].status, 'BOOKED');
    assert.equal(SeatModel.findByIds([seats[0].id])[0].holdExpiresAt, null);

    SeatModel.releaseSeats(seats.map((s) => s.id));
    assert.ok(SeatModel.findByEvent(evt.id).every((s) => s.status === 'AVAILABLE' && s.bookingId === null));

    SeatModel.removeByEvent(evt.id);
    EventModel.remove(evt.id);
  });

  // UT-DS-14
  it('UT-DS-14: SeatModel.expireHeldSeats releases expired holds, expires PENDING booking, and preserves active holds', () => {
    const evt = EventModel.create({
      title: 'Expiry Check Event',
      category: 'Concert',
      venue: 'Arena',
      rounds: [{ id: 'r1', date: '2026-11-29', time: '19:00' }],
      zones: [{ id: 'z1', name: 'GA', price: 1000, rows: 1, cols: 2 }]
    });
    const seats = SeatModel.generateForEvent(evt);
    const user = UserModel.findById('usr-customer-1');
    const expiredAt = new Date(Date.now() - 5000).toISOString();
    const futureAt = new Date(Date.now() + 300000).toISOString();

    const expiredBooking = BookingModel.createPending({
      bookingId: 'bkg-exp-1',
      user,
      event: evt,
      roundId: 'r1',
      targetSeats: [seats[0]],
      holdExpiresAt: expiredAt
    });
    SeatModel.holdSeats([seats[0]], user.id, expiredBooking.id, expiredAt);
    SeatModel.holdSeats([seats[1]], user.id, 'bkg-active-2', futureAt);

    const changed = SeatModel.expireHeldSeats();
    assert.deepEqual(changed, { seatsChanged: true, bookingsChanged: true });
    assert.equal(SeatModel.findByIds([seats[0].id])[0].status, 'AVAILABLE');
    assert.equal(BookingModel.findById('bkg-exp-1').status, 'EXPIRED');
    assert.equal(SeatModel.findByIds([seats[1].id])[0].status, 'HELD');

    SeatModel.removeByEvent(evt.id);
    EventModel.remove(evt.id);
  });

  // UT-DS-15
  it('UT-DS-15: SeatModel availability & inventory helpers return accurate zone/event counts and lock flags', () => {
    const availZones = SeatModel.getZoneSeatAvailability('evt-1', 'rnd-1a');
    assert.ok(availZones.length >= 3);
    assert.equal(availZones[0].totalSeats, 32);

    const summary = SeatModel.getEventSeatSummary('evt-1');
    assert.equal(summary.total, summary.available + summary.held + summary.booked);
    assert.equal(SeatModel.hasNonAvailableSeats('evt-1', 'rnd-1a'), true);
    assert.equal(SeatModel.hasBookedSeats('evt-1'), true);
  });

  // UT-DS-16
  it('UT-DS-16: SeatModel.propagateZoneUpdates & regenerateForEvent update seat metadata and layout cleanly', () => {
    const evt = EventModel.create({
      title: 'Zone Update Event',
      category: 'Concert',
      venue: 'Hall',
      rounds: [{ id: 'r1', date: '2026-12-05', time: '19:00' }],
      zones: [
        {
          id: 'z-cust',
          name: 'VIP',
          color: '#1D56CF',
          price: 2000,
          seats: [{ label: 'S1', x: 10, y: 10 }]
        }
      ]
    });
    SeatModel.generateForEvent(evt);

    const updatedZones = [
      {
        id: 'z-cust',
        name: 'VIP Plus',
        color: '#FF0800',
        price: 2400,
        seats: [{ label: 'S1', x: 15, y: 25, color: '#00AA00', price: 2600 }]
      }
    ];
    assert.deepEqual(SeatModel.propagateZoneUpdates(evt.id, []), { updatedCount: 0 });
    SeatModel.propagateZoneUpdates(evt.id, updatedZones);
    const afterProp = SeatModel.findByEvent(evt.id)[0];
    assert.equal(afterProp.zoneName, 'VIP Plus');
    assert.equal(afterProp.zoneColor, '#FF0800');
    assert.equal(afterProp.seatColor, '#00AA00');
    assert.equal(afterProp.price, 2600);

    const regen = SeatModel.regenerateForEvent(evt, [{ id: 'z-new', name: 'New', price: 900, rows: 1, cols: 3 }]);
    assert.equal(regen.length, 3);
    assert.equal(SeatModel.findByEvent(evt.id).length, 3);

    SeatModel.removeByEvent(evt.id);
    EventModel.remove(evt.id);
  });

  // UT-DS-17
  it('UT-DS-17: BookingModel.createPending computes subtotal, serviceFee (40 THB/ticket), totalAmount, and update modifies status', () => {
    assert.equal(BookingModel.HOLD_DURATION_MS, 600000);
    assert.equal(BookingModel.SERVICE_FEE_PER_TICKET, 40);

    const user = UserModel.findById('usr-customer-1');
    const event = EventModel.findById('evt-1');
    const seats = SeatModel.findByEventAndRound('evt-1', 'rnd-1a').filter((s) => s.status === 'AVAILABLE').slice(0, 2);
    const booking = BookingModel.createPending({
      bookingId: 'bkg-unit-1',
      user,
      event,
      roundId: 'rnd-1a',
      targetSeats: seats,
      holdExpiresAt: new Date(Date.now() + 600000).toISOString()
    });

    const expectedSub = seats.reduce((sum, s) => sum + s.price, 0);
    assert.equal(booking.subtotal, expectedSub);
    assert.equal(booking.serviceFee, 80);
    assert.equal(booking.totalAmount, expectedSub + 80);
    assert.equal(booking.status, 'PENDING');

    const paid = BookingModel.update('bkg-unit-1', { status: 'PAID' });
    assert.equal(paid.status, 'PAID');
    assert.equal(BookingModel.findById('bkg-unit-1').status, 'PAID');
  });

  // UT-DS-18
  it('UT-DS-18: BookingModel queries return user bookings sorted newest-first and paid event bookings', () => {
    const userBookings = BookingModel.findByUserId('usr-customer-1');
    assert.ok(userBookings.length >= 1);
    for (let i = 1; i < userBookings.length; i++) {
      assert.ok(new Date(userBookings[i - 1].createdAt).getTime() >= new Date(userBookings[i].createdAt).getTime());
    }
    assert.ok(BookingModel.findByEventId('evt-1').length >= 1);
    assert.ok(BookingModel.findPaidByEventId('evt-1').length >= 1);
    assert.equal(BookingModel.hasPaidBookings('evt-1'), true);
    assert.equal(BookingModel.hasPaidBookings('evt-unknown'), false);
  });

  // UT-DS-19
  it('UT-DS-19: PaymentModel.create & lookup methods record SUCCESS payments with TH reference codes', () => {
    const pay = PaymentModel.create({
      bookingId: 'bkg-unit-1',
      userId: 'usr-customer-1',
      method: 'PROMPTPAY',
      amount: 9080
    });
    assert.equal(pay.status, 'SUCCESS');
    assert.ok(pay.referenceCode.startsWith('TH-PR-'));
    assert.equal(PaymentModel.findByBookingId('bkg-unit-1')?.id, pay.id);
    assert.ok(PaymentModel.findByUserId('usr-customer-1').some((p) => p.id === pay.id));
    assert.ok(PaymentModel.findAll().some((p) => p.id === pay.id));
  });

  // UT-DS-20
  it('UT-DS-20: PaymentModel.markRefunded updates refund fields and returns null for unknown booking', () => {
    const refunded = PaymentModel.markRefunded('bkg-unit-1', 9000, 'USER_CANCELLED');
    assert.equal(refunded.status, 'REFUNDED');
    assert.equal(refunded.refundAmount, 9000);
    assert.equal(refunded.refundReason, 'USER_CANCELLED');
    assert.ok(refunded.refundedAt);
    assert.equal(PaymentModel.markRefunded('bkg-nonexistent', 100), null);
  });

  // UT-DS-21
  it('UT-DS-21: TicketModel.issueForBooking generates PNG QR codes and findByUserId/findByBookingId retrieve them', async () => {
    const booking = BookingModel.findById('bkg-unit-1');
    const seats = SeatModel.findByIds(booking.seatIds);
    const issued = await TicketModel.issueForBooking(booking, seats, ['Holder One', 'Holder Two']);

    assert.equal(issued.length, 2);
    assert.equal(issued[0].status, 'VALID');
    assert.ok(issued[0].qrDataUrl.startsWith('data:image/png;base64,'));
    assert.equal(TicketModel.findByBookingId('bkg-unit-1').length, 2);
    assert.ok(TicketModel.findByUserId('usr-customer-1').length >= 2);
    assert.ok(TicketModel.findAll().length >= 2);
  });

  // UT-DS-22
  it('UT-DS-22: TicketModel.findByLookupCode, checkIn, cancelByBookingId handle all lookup formats and preserve CHECKED_IN tickets', () => {
    const tickets = TicketModel.findByBookingId('bkg-unit-1');
    const first = tickets[0];
    const second = tickets[1];

    assert.equal(TicketModel.findByLookupCode(''), null);
    assert.equal(TicketModel.findByLookupCode(first.ticketCode.toLowerCase())?.id, first.id);
    assert.equal(TicketModel.findByLookupCode(first.id)?.id, first.id);
    assert.equal(TicketModel.findByLookupCode(first.qrPayload)?.id, first.id);
    assert.equal(TicketModel.findByLookupCode(first.qrDataUrl)?.id, first.id);

    const checked = TicketModel.checkIn(first.id, 'Gate Scanner');
    assert.equal(checked.status, 'CHECKED_IN');
    assert.equal(checked.checkedInBy, 'Gate Scanner');

    const cancelledList = TicketModel.cancelByBookingId('bkg-unit-1');
    assert.equal(cancelledList.find((t) => t.id === first.id).status, 'CHECKED_IN');
    assert.equal(cancelledList.find((t) => t.id === second.id).status, 'CANCELLED');
  });

  // UT-DS-23
  it('UT-DS-23: PromotionModel.findActiveByCode matches active promo case-insensitively and rejects inactive/empty codes', () => {
    store.insert('promotions', {
      id: 'promo-inactive',
      code: 'EXPIRED50',
      discountType: 'FIXED',
      discountValue: 50,
      minSpend: 0,
      active: false
    });

    assert.equal(PromotionModel.findActiveByCode('tickethub10')?.code, 'TICKETHUB10');
    assert.equal(PromotionModel.findActiveByCode('EXPIRED50'), null);
    assert.equal(PromotionModel.findActiveByCode('UNKNOWN'), null);
    assert.equal(PromotionModel.findActiveByCode(''), null);
  });

  // UT-DS-24
  it('UT-DS-24: NotificationModel.create, findById, findByUserId, markAsRead persist and sort newest-first', () => {
    const created = NotificationModel.create({
      userId: 'usr-customer-1',
      type: 'SYSTEM_TEST',
      subject: 'Unit Test Alert',
      message: 'Message body',
      emailTo: 'user@ticket.com',
      createdAt: '2026-12-31T23:59:59.000Z'
    });
    assert.equal(NotificationModel.findById(created.id)?.isRead, false);
    assert.equal(NotificationModel.findByUserId('usr-customer-1')[0].id, created.id);

    const read = NotificationModel.markAsRead(created.id);
    assert.equal(read.isRead, true);
  });

  // UT-DS-25
  it('UT-DS-25: SupportModel.create, findAll, findById, findByUserId, resolve manage support ticket lifecycle', () => {
    const user = UserModel.findById('usr-customer-1');
    const created = SupportModel.create({
      user,
      subject: '  Need Invoice  ',
      message: '  Please send tax invoice  '
    });
    assert.equal(created.status, 'OPEN');
    assert.equal(created.category, 'General Inquiry');
    assert.equal(SupportModel.findById(created.id)?.subject, 'Need Invoice');
    assert.ok(SupportModel.findByUserId(user.id).some((s) => s.id === created.id));
    assert.ok(SupportModel.findAll().some((s) => s.id === created.id));

    const resolved = SupportModel.resolve(created.id, '  Invoice emailed.  ');
    assert.equal(resolved.status, 'RESOLVED');
    assert.equal(resolved.adminReply, 'Invoice emailed.');
  });
});
