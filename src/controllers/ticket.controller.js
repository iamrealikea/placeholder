const { TicketModel, BookingModel, PaymentModel } = require('../models');

/**
 * FR-28, FR-29: View User's Tickets with QR Codes
 * GET /api/tickets/my
 */
function getMyTickets(req, res) {
  const tickets = TicketModel.findByUserId(req.user.id);
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
  const bookings = BookingModel.findByUserId(req.user.id);
  const payments = PaymentModel.findByUserId(req.user.id);

  const paymentMap = {};
  for (const p of payments) {
    paymentMap[p.bookingId] = p;
  }

  const history = bookings.map((b) => ({
    ...b,
    payment: paymentMap[b.id] || null
  }));

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
  if (!lookupCode && qrPayload) {
    try {
      const parsed = typeof qrPayload === 'string' ? JSON.parse(qrPayload) : qrPayload;
      lookupCode = parsed.ticketCode;
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
