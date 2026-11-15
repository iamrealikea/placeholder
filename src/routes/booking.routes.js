const express = require('express');
const { requireAuth } = require('../middleware/auth');
const bookingController = require('../controllers/booking.controller');

const router = express.Router();

router.get('/events/:eventId/rounds/:roundId/seats', bookingController.getRoundSeats);
router.post('/hold', requireAuth, bookingController.holdSeats);
router.get('/:id/summary', requireAuth, bookingController.getSummary);
router.post('/:id/apply-discount', requireAuth, bookingController.applyDiscount);
router.post('/:id/pay', requireAuth, bookingController.payBooking);
router.post('/:id/cancel', requireAuth, bookingController.cancelBooking);

module.exports = router;
