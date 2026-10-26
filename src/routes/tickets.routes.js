const express = require('express');
const { store } = require('../store/jsonStore');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * FR-28, FR-29: View User's Tickets with QR Codes
 */
router.get('/my', requireAuth, (req, res) => {
  const tickets = store.find('tickets', (t) => t.userId === req.user.id);
  // Sort with VALID active tickets first
  tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json({
    total: tickets.length,
    tickets
  });
});

/**
 * FR-32: User Purchase & Booking History
 */
router.get('/history', requireAuth, (req, res) => {
  const bookings = store.find('bookings', (b) => b.userId === req.user.id);
  bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const payments = store.find('payments', (p) => p.userId === req.user.id);
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
});

/**
 * FR-30, FR-31: Staff / Admin Ticket Validation & QR Scanning
 * Prevents reuse: Checked-in tickets cannot be used again
 */
router.post('/validate', requireRole(['admin', 'staff']), (req, res) => {
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

  const ticket = store.findOne(
    'tickets',
    (t) =>
      t.ticketCode.toUpperCase() === lookupCode.toUpperCase() ||
      t.id === lookupCode ||
      t.qrPayload === lookupCode
  );

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
  const checkedInAt = new Date().toISOString();
  const checkedInBy = req.user.name || 'Gate Staff';

  const updatedTicket = store.update('tickets', ticket.id, {
    status: 'CHECKED_IN',
    checkedInAt,
    checkedInBy
  });

  return res.json({
    valid: true,
    message: 'Check-in successful! Ticket is valid.',
    ticket: updatedTicket
  });
});

module.exports = router;
