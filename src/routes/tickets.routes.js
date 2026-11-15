const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ticketController = require('../controllers/ticket.controller');

const router = express.Router();

router.get('/my', requireAuth, ticketController.getMyTickets);
router.get('/history', requireAuth, ticketController.getHistory);
router.post('/validate', requireRole(['admin', 'staff']), ticketController.validateTicket);

module.exports = router;
