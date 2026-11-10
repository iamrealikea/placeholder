const { v4: uuidv4 } = require('uuid');
const {
  EventModel,
  SeatModel,
  BookingModel,
  UserModel,
  PromotionModel,
  PaymentModel,
  TicketModel,
  NotificationModel
} = require('../models');

/**
 * FR-16, FR-17, FR-18, FR-21, FR-22: Fetch Seat Map for an Event & Round
 * GET /api/bookings/events/:eventId/rounds/:roundId/seats
 */
function getRoundSeats(req, res) {
  SeatModel.expireHeldSeats();
  const { eventId, roundId } = req.params;

  const event = EventModel.findById(eventId);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const seats = SeatModel.findByEventAndRound(eventId, roundId);

  return res.json({
    eventId,
    roundId,
    eventTitle: event.title,
    zones: event.zones,
    seats
  });
}

/**
 * FR-23, FR-49: Hold Seats & Create PENDING Booking (Prevent Double Booking)
 * POST /api/bookings/hold
 */
function holdSeats(req, res) {
  SeatModel.expireHeldSeats();
  const { eventId, roundId, seatIds } = req.body;

  if (!eventId || !roundId || !Array.isArray(seatIds) || seatIds.length === 0) {
    return res.status(400).json({ error: 'Please select at least one seat.' });
  }

  const event = EventModel.findById(eventId);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  // FR-49: Sale period restriction check
  if (!EventModel.isSaleOpen(event)) {
    return res.status(403).json({
      error: 'Ticket sales for this event are currently closed or outside the scheduled sale period.'
    });
  }

  if (seatIds.length > (event.maxTicketsPerUser || 6)) {
    return res.status(400).json({
      error: `You may select a maximum of ${event.maxTicketsPerUser || 6} tickets per transaction.`
    });
  }

  const allSeats = SeatModel.findAll();
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

  const holdExpiresAt = new Date(Date.now() + BookingModel.HOLD_DURATION_MS).toISOString();
  const bookingId = `bkg-${uuidv4().slice(0, 8)}`;

  SeatModel.holdSeats(targetSeats, req.user.id, bookingId, holdExpiresAt);

  const booking = BookingModel.createPending({
    bookingId,
    user: req.user,
    event,
    roundId,
    targetSeats,
    holdExpiresAt
  });

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
}

/**
 * FR-24: Get Booking Summary by ID
 * GET /api/bookings/:id/summary
 */
function getSummary(req, res) {
  SeatModel.expireHeldSeats();
  const booking = BookingModel.findById(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  if (booking.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Another user is currently holding this booking.' });
  }

  const user = UserModel.findById(req.user.id);
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
}

/**
 * FR-47, FR-46: Apply Promo Code or Redeem Points
 * POST /api/bookings/:id/apply-discount
 */
function applyDiscount(req, res) {
  SeatModel.expireHeldSeats();
  const booking = BookingModel.findById(req.params.id);
  if (!booking || booking.status !== 'PENDING') {
    return res.status(400).json({ error: 'Active pending booking required to apply discount.' });
  }

  const { promoCode, redeemPoints } = req.body;
  const user = UserModel.findById(req.user.id);
  let discountAmount = 0;
  let codeApplied = null;
  let pointsUsed = 0;

  if (promoCode) {
    const promo = PromotionModel.findActiveByCode(promoCode);
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

  const updated = BookingModel.update(booking.id, {
    promoCode: codeApplied,
    pointsUsed,
    discountAmount,
    totalAmount
  });

  return res.json({
    message: 'Discount applied successfully',
    booking: updated
  });
}

/**
 * FR-25, FR-26, FR-27, FR-33, FR-35, FR-36: Confirm Payment & Issue Tickets
 * POST /api/bookings/:id/pay
 */
async function payBooking(req, res) {
  SeatModel.expireHeldSeats();
  const booking = BookingModel.findById(req.params.id);
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

  const { paymentMethod } = req.body;
  const validMethods = ['PROMPTPAY', 'CREDIT_CARD', 'DEBIT_CARD', 'KBANK', 'KRUNGTHAI', 'TRUEMONEY'];
  if (!validMethods.includes(paymentMethod)) {
    return res.status(400).json({
      error: `Invalid payment method. Allowed: ${validMethods.join(', ')}`
    });
  }

  // Atomic payment confirmation & seat transition (NFR-09)
  const seats = SeatModel.markBooked(booking.seatIds);

  // Record payment
  const paymentRecord = PaymentModel.create({
    bookingId: booking.id,
    userId: req.user.id,
    method: paymentMethod,
    amount: booking.totalAmount
  });

  // Update Booking
  BookingModel.update(booking.id, {
    status: 'PAID',
    paymentMethod,
    holdExpiresAt: null
  });

  // Deduct points if used, add points earned (FR-46)
  UserModel.adjustPoints(req.user.id, booking.pointsUsed || 0, booking.pointsEarned || 0);

  // Issue electronic tickets with real QR code (FR-27, FR-28, FR-29)
  const issuedTickets = await TicketModel.issueForBooking(booking, seats, req.user.name);

  // FR-33, FR-35, FR-36: Web & Email notifications on payment success
  NotificationModel.create({
    userId: req.user.id,
    channel: 'BOTH',
    type: 'PAYMENT_SUCCESS',
    subject: `Payment Confirmed: ${booking.eventTitle}`,
    message: `Your payment of ${booking.totalAmount.toLocaleString()} THB via ${paymentMethod} was successful. ${issuedTickets.length} ticket(s) are ready in My Tickets.`,
    emailTo: req.user.email
  });

  return res.json({
    message: 'Payment confirmed and electronic tickets issued successfully!',
    payment: paymentRecord,
    tickets: issuedTickets
  });
}

/**
 * Reusable helper: Cancels a booking, releases seats, cancels tickets,
 * processes refund (for paid bookings), and dispatches notifications.
 *
 * @param {Object} booking - Booking object from BookingModel
 * @param {Object} [options={}]
 * @param {string} [options.reason='EVENT_CANCELLED'] - 'EVENT_CANCELLED' | 'USER_CANCELLED'
 * @param {boolean} [options.notify=true] - Whether to send notification
 * @param {string} [options.customMessage] - Optional custom message
 * @returns {Object} Result summary
 */
function cancelAndRefundBooking(booking, options = {}) {
  if (!booking) return null;
  const reason = options.reason || 'EVENT_CANCELLED';
  const shouldNotify = options.notify !== false;

  const serviceFee = typeof booking.serviceFee === 'number'
    ? booking.serviceFee
    : ((booking.seatIds || []).length * (BookingModel.SERVICE_FEE_PER_TICKET || 40));

  // 1. Release seats back to AVAILABLE if any seats associated
  if (Array.isArray(booking.seatIds) && booking.seatIds.length > 0) {
    SeatModel.releaseSeats(booking.seatIds);
  }

  // 2. Handle PAID bookings
  if (booking.status === 'PAID') {
    // Refund: Ticket Subtotal - Discount (Service fee 40 THB/seat is NON-REFUNDABLE per FR-39)
    const refundableAmount = Math.max(0, (booking.subtotal || 0) - (booking.discountAmount || 0));

    // Cancel all electronic tickets issued for this booking
    TicketModel.cancelByBookingId(booking.id);

    // Update payment record to REFUNDED with refund amount and reason
    PaymentModel.markRefunded(booking.id, refundableAmount, reason);

    // Update booking status
    BookingModel.update(booking.id, {
      status: 'CANCELLED',
      cancellationReason: reason,
      cancelledAt: new Date().toISOString()
    });

    // Dispatch notification
    if (shouldNotify) {
      const isEventCancelled = reason === 'EVENT_CANCELLED';
      const subject = isEventCancelled
        ? `Event Cancelled & Refund Issued: ${booking.eventTitle}`
        : `Booking Cancelled & Refunded: ${booking.eventTitle}`;
      const message = options.customMessage || (isEventCancelled
        ? `The event "${booking.eventTitle}" has been cancelled. A refund of ${refundableAmount.toLocaleString()} THB for booking ${booking.id} has been processed to your payment method (Service fee of ${serviceFee} THB retained per policy).`
        : `Your booking ${booking.id} has been cancelled. A refund of ${refundableAmount.toLocaleString()} THB has been issued to your payment method (Service fee of ${serviceFee} THB was non-refundable).`);

      NotificationModel.create({
        userId: booking.userId,
        channel: 'BOTH',
        type: isEventCancelled ? 'EVENT_CANCELLED' : 'REFUND',
        subject,
        message,
        ...(booking.userEmail ? { emailTo: booking.userEmail } : {})
      });
    }

    return {
      bookingId: booking.id,
      status: 'CANCELLED',
      wasPaid: true,
      refundableAmount,
      nonRefundableFee: serviceFee,
      originalTotal: booking.totalAmount
    };
  }

  // 3. Handle non-paid bookings (PENDING, HELD, etc.)
  BookingModel.update(booking.id, {
    status: 'CANCELLED',
    holdExpiresAt: null,
    cancellationReason: reason,
    cancelledAt: new Date().toISOString()
  });

  if (shouldNotify && reason === 'EVENT_CANCELLED') {
    NotificationModel.create({
      userId: booking.userId,
      channel: 'BOTH',
      type: 'EVENT_CANCELLED',
      subject: `Event Cancelled: ${booking.eventTitle}`,
      message: `The event "${booking.eventTitle}" has been cancelled. Your pending seat reservation has been released.`,
      ...(booking.userEmail ? { emailTo: booking.userEmail } : {})
    });
  }

  return {
    bookingId: booking.id,
    status: 'CANCELLED',
    wasPaid: false,
    refundableAmount: 0,
    nonRefundableFee: 0,
    originalTotal: booking.totalAmount || 0
  };
}

/**
 * FR-38, FR-39: Cancel Ticket / Booking & Process Refund
 * POST /api/bookings/:id/cancel
 */
function cancelBooking(req, res) {
  const booking = BookingModel.findById(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  if (booking.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized.' });
  }
  if (booking.status !== 'PAID') {
    return res.status(400).json({ error: 'Only paid bookings can be cancelled.' });
  }

  const event = EventModel.findById(booking.eventId);
  if (!event || event.allowCancellation === false) {
    return res.status(400).json({ error: 'This event does not allow ticket cancellations.' });
  }

  const result = cancelAndRefundBooking(booking, { reason: 'USER_CANCELLED' });

  return res.json({
    message: 'Booking cancelled successfully. Refund processed according to policy.',
    refundableAmount: result.refundableAmount,
    nonRefundableFee: result.nonRefundableFee,
    originalTotal: result.originalTotal
  });
}

module.exports = {
  getRoundSeats,
  holdSeats,
  getSummary,
  applyDiscount,
  payBooking,
  cancelBooking,
  cancelAndRefundBooking
};
