const { v4: uuidv4 } = require('uuid');
const { store } = require('../store/jsonStore');

const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes hold lock
const SERVICE_FEE_PER_TICKET = 40; // 40 THB service fee per ticket (non-refundable on cancel)

class BookingModel {
  static get HOLD_DURATION_MS() {
    return HOLD_DURATION_MS;
  }

  static get SERVICE_FEE_PER_TICKET() {
    return SERVICE_FEE_PER_TICKET;
  }

  static findAll() {
    return store.getAll('bookings');
  }

  static findById(id) {
    return store.findById('bookings', id);
  }

  static findByUserId(userId) {
    const bookings = store.find('bookings', (b) => b.userId === userId);
    bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return bookings;
  }

  static findPaidByEventId(eventId) {
    return store.find('bookings', (b) => b.eventId === eventId && b.status === 'PAID');
  }

  static hasPaidBookings(eventId) {
    return Boolean(
      store.findOne('bookings', (b) => b.eventId === eventId && b.status === 'PAID')
    );
  }

  static createPending({ bookingId, user, event, roundId, targetSeats, holdExpiresAt }) {
    const id = bookingId || `bkg-${uuidv4().slice(0, 8)}`;
    const subtotal = targetSeats.reduce((sum, s) => sum + s.price, 0);
    const serviceFee = targetSeats.length * SERVICE_FEE_PER_TICKET;
    const totalAmount = subtotal + serviceFee;

    const round = (event.rounds || []).find((r) => r.id === roundId) || {
      label: 'General Admission'
    };

    const booking = {
      id,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userPhone: user.phone,
      eventId: event.id,
      eventTitle: event.title,
      venue: event.venue,
      roundId,
      roundLabel: round.label || `${round.date} • ${round.time}`,
      seatIds: targetSeats.map((s) => s.id),
      seatNumbers: targetSeats.map((s) => s.seatNumber),
      zoneName: targetSeats[0].zoneName,
      subtotal,
      serviceFee,
      discountAmount: 0,
      promoCode: null,
      pointsUsed: 0,
      pointsEarned: Math.floor(subtotal / 100),
      totalAmount,
      paymentMethod: null,
      status: 'PENDING',
      holdExpiresAt,
      createdAt: new Date().toISOString()
    };

    return store.insert('bookings', booking);
  }

  static update(id, updates) {
    return store.update('bookings', id, updates);
  }
}

module.exports = BookingModel;
