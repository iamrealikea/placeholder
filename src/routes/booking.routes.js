const express = require('express');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { store } = require('../store/jsonStore');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes hold lock
const SERVICE_FEE_PER_TICKET = 40; // 40 THB service fee per ticket (non-refundable on cancel)

/**
 * FR-16, FR-17, FR-18, FR-21, FR-22: Fetch Seat Map for an Event & Round
 */
router.get('/events/:eventId/rounds/:roundId/seats', (req, res) => {
  store.expireHeldSeats();
  const { eventId, roundId } = req.params;

  const event = store.findById('events', eventId);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const seats = store.find(
    'seats',
    (s) => s.eventId === eventId && s.roundId === roundId
  );

  return res.json({
    eventId,
    roundId,
    eventTitle: event.title,
    zones: event.zones,
    seats
  });
});

/**
 * FR-23, FR-49: Hold Seats & Create PENDING Booking (Prevent Double Booking)
 */
router.post('/hold', requireAuth, (req, res) => {
  store.expireHeldSeats();
  const { eventId, roundId, seatIds } = req.body;

  if (!eventId || !roundId || !Array.isArray(seatIds) || seatIds.length === 0) {
    return res.status(400).json({ error: 'Please select at least one seat.' });
  }

  const event = store.findById('events', eventId);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  // FR-49: Sale period restriction check
  const now = new Date();
  const saleStart = new Date(event.saleStartAt);
  const saleEnd = new Date(event.saleEndAt);
  if (now < saleStart || now > saleEnd || event.status !== 'On Sale') {
    return res.status(403).json({
      error: 'Ticket sales for this event are currently closed or outside the scheduled sale period.'
    });
  }

  if (seatIds.length > (event.maxTicketsPerUser || 6)) {
    return res.status(400).json({
      error: `You may select a maximum of ${event.maxTicketsPerUser || 6} tickets per transaction.`
    });
  }

  const allSeats = store.getAll('seats');
  const targetSeats = [];

  // Atomic seat validation to prevent double booking (FR-23, NFR-08)
  for (const sid of seatIds) {
    const seat = allSeats.find(
      (s) => s.id === sid && s.eventId === eventId && s.roundId === roundId
    );
    if (!seat) {
      return res.status(404).json({ error: `Seat "${sid}" not found in this round.` });
    }
    if (seat.status === 'BOOKED') {
      return res.status(409).json({
        error: `Seat ${seat.seatNumber} has already been booked by another user.`
      });
    }
    if (seat.status === 'HELD' && seat.heldByUserId !== req.user.id) {
      return res.status(409).json({
        error: `Seat ${seat.seatNumber} is currently reserved by another customer. Please choose another seat.`
      });
    }
    targetSeats.push(seat);
  }

  const holdExpiresAt = new Date(Date.now() + HOLD_DURATION_MS).toISOString();
  const bookingId = `bkg-${uuidv4().slice(0, 8)}`;

  // Lock seats
  for (const s of targetSeats) {
    s.status = 'HELD';
    s.heldByUserId = req.user.id;
    s.holdExpiresAt = holdExpiresAt;
    s.bookingId = bookingId;
  }
  store.save('seats');

  const subtotal = targetSeats.reduce((sum, s) => sum + s.price, 0);
  const serviceFee = targetSeats.length * SERVICE_FEE_PER_TICKET;
  const totalAmount = subtotal + serviceFee;

  const round = (event.rounds || []).find((r) => r.id === roundId) || { label: 'General Admission' };

  const booking = {
    id: bookingId,
    userId: req.user.id,
    userEmail: req.user.email,
    userName: req.user.name,
    userPhone: req.user.phone,
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

  store.insert('bookings', booking);

  return res.status(201).json({
    message: 'Seats held successfully for 10 minutes.',
    booking,
    heldSeats: targetSeats.map((s) => ({
      id: s.id,
      seatNumber: s.seatNumber,
      zoneName: s.zoneName,
      price: s.price
    }))
  });
});

/**
 * FR-24: Get Booking Summary by ID
 */
router.get('/:id/summary', requireAuth, (req, res) => {
  store.expireHeldSeats();
  const booking = store.findById('bookings', req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  if (booking.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const user = store.findById('users', req.user.id);
  const remainingSeconds = Math.max(
    0,
    Math.floor((new Date(booking.holdExpiresAt).getTime() - Date.now()) / 1000)
  );

  return res.json({
    booking,
    userPoints: user ? user.points || 0 : 0,
    remainingSeconds,
    isExpired: booking.status === 'EXPIRED' || remainingSeconds <= 0
  });
});

/**
 * FR-47, FR-46: Apply Promo Code or Redeem Points
 */
router.post('/:id/apply-discount', requireAuth, (req, res) => {
  store.expireHeldSeats();
  const booking = store.findById('bookings', req.params.id);
  if (!booking || booking.status !== 'PENDING') {
    return res.status(400).json({ error: 'Active pending booking required to apply discount.' });
  }

  const { promoCode, redeemPoints } = req.body;
  const user = store.findById('users', req.user.id);
  let discountAmount = 0;
  let codeApplied = null;
  let pointsUsed = 0;

  if (promoCode) {
    const promo = store.findOne(
      'promotions',
      (p) => p.code.toUpperCase() === String(promoCode).toUpperCase() && p.active
    );
    if (!promo) {
      return res.status(400).json({ error: 'Invalid or expired promotional code.' });
    }
    if (booking.subtotal < (promo.minSpend || 0)) {
      return res.status(400).json({
        error: `Minimum spend of ${promo.minSpend} THB required for code "${promo.code}".`
      });
    }
    codeApplied = promo.code;
    if (promo.discountType === 'PERCENT') {
      discountAmount += Math.round((booking.subtotal * promo.discountValue) / 100);
    } else {
      discountAmount += promo.discountValue;
    }
  }

  if (redeemPoints && Number(redeemPoints) > 0) {
    const pts = Math.min(Number(redeemPoints), user.points || 0);
    // 100 points = 10 THB
    const pointDiscount = Math.floor(pts / 10);
    if (pointDiscount > 0) {
      pointsUsed = pts;
      discountAmount += pointDiscount;
    }
  }

  discountAmount = Math.min(discountAmount, booking.subtotal);
  const totalAmount = Math.max(0, booking.subtotal - discountAmount + booking.serviceFee);

  const updated = store.update('bookings', booking.id, {
    promoCode: codeApplied,
    pointsUsed,
    discountAmount,
    totalAmount
  });

  return res.json({
    message: 'Discount applied successfully',
    booking: updated
  });
});

/**
 * FR-25, FR-26, FR-27, FR-33, FR-35, FR-36: Confirm Payment & Issue Tickets
 */
router.post('/:id/pay', requireAuth, async (req, res) => {
  store.expireHeldSeats();
  const booking = store.findById('bookings', req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  if (booking.userId !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized booking payment.' });
  }
  if (booking.status === 'PAID') {
    return res.status(400).json({ error: 'This booking has already been paid.' });
  }
  if (booking.status === 'EXPIRED') {
    return res.status(400).json({
      error: 'Your 10-minute seat reservation has expired. Please reselect your seats.'
    });
  }

  const { paymentMethod, paymentDetails } = req.body;
  const validMethods = ['PROMPTPAY', 'CREDIT_CARD', 'DEBIT_CARD', 'KBANK', 'KRUNGTHAI', 'TRUEMONEY'];
  if (!validMethods.includes(paymentMethod)) {
    return res.status(400).json({
      error: `Invalid payment method. Allowed: ${validMethods.join(', ')}`
    });
  }

  // Atomic payment confirmation & seat transition (NFR-09)
  const seats = store.find('seats', (s) => booking.seatIds.includes(s.id));
  for (const s of seats) {
    s.status = 'BOOKED';
    s.holdExpiresAt = null;
  }
  store.save('seats');

  // Record payment
  const paymentRecord = {
    id: `pay-${uuidv4().slice(0, 8)}`,
    bookingId: booking.id,
    userId: req.user.id,
    method: paymentMethod,
    amount: booking.totalAmount,
    referenceCode: `TH-${paymentMethod.slice(0, 2)}-${Date.now()}`,
    status: 'SUCCESS',
    refundAmount: 0,
    paidAt: new Date().toISOString(),
    refundedAt: null
  };
  store.insert('payments', paymentRecord);

  // Update Booking
  store.update('bookings', booking.id, {
    status: 'PAID',
    paymentMethod,
    holdExpiresAt: null
  });

  // Deduct points if used, add points earned (FR-46)
  const user = store.findById('users', req.user.id);
  let newPoints = (user.points || 0) - (booking.pointsUsed || 0) + (booking.pointsEarned || 0);
  store.update('users', user.id, { points: Math.max(0, newPoints) });

  // Issue electronic tickets with real QR code (FR-27, FR-28, FR-29)
  const issuedTickets = [];
  for (const s of seats) {
    const ticketCode = `TKT-${booking.id.slice(-4).toUpperCase()}-${s.seatNumber}-${Math.round(Math.random() * 1e4)}`;
    const qrPayload = JSON.stringify({
      ticketCode,
      bookingId: booking.id,
      eventId: booking.eventId,
      roundId: booking.roundId,
      seatNumber: s.seatNumber,
      holder: req.user.name
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
      userId: req.user.id,
      eventId: booking.eventId,
      eventTitle: booking.eventTitle,
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

  // FR-33, FR-35, FR-36: Web & Email notifications on payment success
  const notif = {
    id: `ntf-${uuidv4().slice(0, 8)}`,
    userId: req.user.id,
    channel: 'BOTH',
    type: 'PAYMENT_SUCCESS',
    subject: `Payment Confirmed: ${booking.eventTitle}`,
    message: `Your payment of ${booking.totalAmount.toLocaleString()} THB via ${paymentMethod} was successful. ${issuedTickets.length} ticket(s) are ready in My Tickets.`,
    emailTo: req.user.email,
    isRead: false,
    createdAt: new Date().toISOString()
  };
  store.insert('notifications', notif);

  return res.json({
    message: 'Payment confirmed and electronic tickets issued successfully!',
    payment: paymentRecord,
    tickets: issuedTickets
  });
});

/**
 * FR-38, FR-39: Cancel Ticket / Booking & Process Refund
 * (Non-refundable service fee: refunds ticket subtotal only)
 */
router.post('/:id/cancel', requireAuth, (req, res) => {
  const booking = store.findById('bookings', req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  if (booking.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized.' });
  }
  if (booking.status !== 'PAID') {
    return res.status(400).json({ error: 'Only paid bookings can be cancelled.' });
  }

  const event = store.findById('events', booking.eventId);
  if (!event || event.allowCancellation === false) {
    return res.status(400).json({ error: 'This event does not allow ticket cancellations.' });
  }

  // Calculate refund amount: Ticket Subtotal - Discount (Service fee is NON-REFUNDABLE per FR-39)
  const refundableAmount = Math.max(0, booking.subtotal - (booking.discountAmount || 0));

  // Release seats back to AVAILABLE (FR-38)
  const seats = store.find('seats', (s) => booking.seatIds.includes(s.id));
  for (const s of seats) {
    s.status = 'AVAILABLE';
    s.heldByUserId = null;
    s.holdExpiresAt = null;
    s.bookingId = null;
  }
  store.save('seats');

  // Cancel Tickets
  const tickets = store.find('tickets', (t) => t.bookingId === booking.id);
  for (const t of tickets) {
    t.status = 'CANCELLED';
  }
  store.save('tickets');

  // Update Booking status
  store.update('bookings', booking.id, { status: 'CANCELLED' });

  // Update Payment record
  const payment = store.findOne('payments', (p) => p.bookingId === booking.id);
  if (payment) {
    store.update('payments', payment.id, {
      status: 'REFUNDED',
      refundAmount: refundableAmount,
      refundedAt: new Date().toISOString()
    });
  }

  // Dispatch cancellation notification
  store.insert('notifications', {
    id: `ntf-${uuidv4().slice(0, 8)}`,
    userId: booking.userId,
    channel: 'BOTH',
    type: 'REFUND',
    subject: `Booking Cancelled & Refunded: ${booking.eventTitle}`,
    message: `Your booking ${booking.id} has been cancelled. A refund of ${refundableAmount.toLocaleString()} THB has been issued to your payment method (Service fee of ${booking.serviceFee} THB was non-refundable).`,
    isRead: false,
    createdAt: new Date().toISOString()
  });

  return res.json({
    message: 'Booking cancelled successfully. Refund processed according to policy.',
    refundableAmount,
    nonRefundableFee: booking.serviceFee,
    originalTotal: booking.totalAmount
  });
});

module.exports = router;
