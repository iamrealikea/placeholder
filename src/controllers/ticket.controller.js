const { TicketModel, BookingModel, PaymentModel, EventModel, SeatModel } = require('../models');

function enrichBookingMetadata(booking) {
  if (!booking) return booking;
  const event = booking.eventId ? EventModel.findById(booking.eventId) : null;
  const round = event && Array.isArray(event.rounds)
    ? event.rounds.find((r) => r.id === booking.roundId)
    : null;
  const derivedRoundLabel = round
    ? (round.label || `${round.date} • ${round.time}`)
    : 'General Admission';

  return {
    ...booking,
    eventTitle: booking.eventTitle || (event && event.title) || 'Live Event',
    venue: booking.venue || (event && event.venue) || '',
    roundLabel: booking.roundLabel || derivedRoundLabel,
    allowCancellation: event ? event.allowCancellation !== false : true
  };
}

/**
 * FR-28, FR-29: View User's Tickets with QR Codes
 * GET /api/tickets/my
 */
async function getMyTickets(req, res) {
  SeatModel.expireHeldSeats();
  const userBookings = BookingModel.findByUserId(req.user.id);

  // Backfill any PAID booking that is missing its electronic ticket records
  for (const rawBooking of userBookings) {
    if (rawBooking.status !== 'PAID') continue;
    const existing = TicketModel.findByBookingId(rawBooking.id);
    if (existing.length === 0) {
      const booking = enrichBookingMetadata(rawBooking);
      const seatNumbers = Array.isArray(booking.seatNumbers) && booking.seatNumbers.length > 0
        ? booking.seatNumbers
        : ['GA1'];
      const perSeatPrice = seatNumbers.length > 0
        ? Math.round((booking.subtotal || 0) / seatNumbers.length)
        : (booking.subtotal || 0);
      const seats = seatNumbers.map((seatNumber, idx) => ({
        id: (Array.isArray(booking.seatIds) && booking.seatIds[idx]) || `seat-${booking.eventId}-${booking.roundId}-${seatNumber}`,
        seatNumber,
        zoneName: booking.zoneName || 'Standard',
        price: perSeatPrice
      }));
      const holderNames = seats.map(() => booking.userName || req.user.name || 'Ticket Holder');
      const issued = await TicketModel.issueForBooking(booking, seats, holderNames);
      for (const t of issued) {
        if (rawBooking.createdAt) {
          t.createdAt = rawBooking.createdAt;
        }
      }
    }
  }

  const tickets = TicketModel.findByUserId(req.user.id).map((t) => {
    const event = t.eventId ? EventModel.findById(t.eventId) : null;
    return {
      ...t,
      eventTitle: t.eventTitle || (event && event.title) || 'Live Event',
      venue: t.venue || (event && event.venue) || '',
      holderName: t.holderName || req.user.name || 'Ticket Holder'
    };
  });

  return res.json({
    total: tickets.length,
    tickets
  });
}

/**
 * FR-32: User Purchase & Booking History
 * GET /api/tickets/history
 */
function getHistory(req, res) {
  SeatModel.expireHeldSeats();
  const bookings = BookingModel.findByUserId(req.user.id);
  const payments = PaymentModel.findByUserId(req.user.id);

  const paymentMap = {};
  for (const p of payments) {
    paymentMap[p.bookingId] = p;
  }

  const history = bookings.map((rawBooking) => {
    const b = enrichBookingMetadata(rawBooking);
    const bookingTickets = TicketModel.findByBookingId(b.id).map((t) => ({
      id: t.id,
      ticketCode: t.ticketCode,
      seatNumber: t.seatNumber,
      status: t.status
    }));
    return {
      ...b,
      payment: paymentMap[b.id] || null,
      tickets: bookingTickets
    };
  });

  return res.json({
    total: history.length,
    history
  });
}

/**
 * FR-30, FR-31: Staff / Admin Ticket Validation & QR Scanning
 * POST /api/tickets/validate
 */
function validateTicket(req, res) {
  const { ticketCode, qrPayload } = req.body;

  let lookupCode = ticketCode ? String(ticketCode).trim() : null;
  if (lookupCode && lookupCode.startsWith('{')) {
    try {
      const parsedCode = JSON.parse(lookupCode);
      if (parsedCode && parsedCode.ticketCode) {
        lookupCode = String(parsedCode.ticketCode).trim();
      }
    } catch (_) {
      // Keep raw lookupCode
    }
  }
  if (!lookupCode && qrPayload) {
    try {
      const parsed = typeof qrPayload === 'string' ? JSON.parse(qrPayload) : qrPayload;
      lookupCode = parsed.ticketCode || String(qrPayload).trim();
    } catch (_) {
      lookupCode = String(qrPayload).trim();
    }
  }

  if (!lookupCode) {
    return res.status(400).json({ error: 'Please provide a valid ticket code or QR payload.' });
  }

  const ticket = TicketModel.findByLookupCode(lookupCode);

  if (!ticket) {
    return res.status(404).json({
      valid: false,
      reason: 'INVALID_TICKET',
      message: 'Ticket not found in the system. Please verify the code.'
    });
  }

  if (ticket.status === 'CANCELLED') {
    return res.status(400).json({
      valid: false,
      reason: 'CANCELLED_TICKET',
      message: 'This ticket has been cancelled or refunded. Entry is denied.'
    });
  }

  // FR-31: Prevent Reuse
  if (ticket.status === 'CHECKED_IN') {
    return res.status(400).json({
      valid: false,
      reason: 'ALREADY_CHECKED_IN',
      message: `Fraud Warning: Ticket was already checked in on ${new Date(
        ticket.checkedInAt
      ).toLocaleString()} by ${ticket.checkedInBy || 'Staff'}. Cannot be reused.`,
      ticket
    });
  }

  // FR-30: Check in ticket
  const updatedTicket = TicketModel.checkIn(ticket.id, req.user.name || 'Gate Staff');

  return res.json({
    valid: true,
    message: 'Check-in successful! Ticket is valid.',
    ticket: updatedTicket
  });
}

module.exports = {
  getMyTickets,
  getHistory,
  validateTicket
};
