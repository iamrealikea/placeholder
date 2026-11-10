const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { store } = require('../store/jsonStore');

class TicketModel {
  static findAll() {
    return store.getAll('tickets');
  }

  static findByUserId(userId) {
    const tickets = store.find('tickets', (t) => t.userId === userId);
    tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return tickets;
  }

  static findByBookingId(bookingId) {
    return store.find('tickets', (t) => t.bookingId === bookingId);
  }

  static findByLookupCode(lookupCode) {
    if (!lookupCode) return null;
    const upper = String(lookupCode).toUpperCase();
    return store.findOne(
      'tickets',
      (t) =>
        t.ticketCode.toUpperCase() === upper ||
        t.id === lookupCode ||
        t.qrPayload === lookupCode
    );
  }

  static async issueForBooking(booking, seats, holderNames) {
    const issuedTickets = [];
    for (const [index, s] of seats.entries()) {
      const holderName = holderNames[index];
      const ticketCode = `TKT-${booking.id.slice(-4).toUpperCase()}-${s.seatNumber}-${Math.round(Math.random() * 1e4)}`;
      const qrPayload = JSON.stringify({
        ticketCode,
        bookingId: booking.id,
        eventId: booking.eventId,
        roundId: booking.roundId,
        seatNumber: s.seatNumber,
        holder: holderName
      });

      const qrDataUrl = await QRCode.toDataURL(qrPayload, {
        width: 320,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' }
      });

      const ticketItem = {
        id: `tkt-${uuidv4().slice(0, 8)}`,
        ticketCode,
        bookingId: booking.id,
        userId: booking.userId,
        eventId: booking.eventId,
        eventTitle: booking.eventTitle,
        holderName,
        venue: booking.venue,
        roundId: booking.roundId,
        roundLabel: booking.roundLabel,
        seatId: s.id,
        seatNumber: s.seatNumber,
        zoneName: s.zoneName,
        price: s.price,
        qrPayload,
        qrDataUrl,
        status: 'VALID',
        checkedInAt: null,
        checkedInBy: null,
        createdAt: new Date().toISOString()
      };
      store.insert('tickets', ticketItem);
      issuedTickets.push(ticketItem);
    }
    return issuedTickets;
  }

  static checkIn(ticketId, staffName) {
    return store.update('tickets', ticketId, {
      status: 'CHECKED_IN',
      checkedInAt: new Date().toISOString(),
      checkedInBy: staffName || 'Gate Staff'
    });
  }

  static cancelByBookingId(bookingId) {
    const tickets = this.findByBookingId(bookingId);
    for (const t of tickets) {
      t.status = 'CANCELLED';
    }
    store.save('tickets');
    return tickets;
  }
}

module.exports = TicketModel;
