const express = require('express');
const { optionalAuth, requireAuth, requireRole } = require('../middleware/auth');
const eventController = require('../controllers/event.controller');

const router = express.Router();

router.get('/', optionalAuth, eventController.listEvents);
router.get('/:id', optionalAuth, eventController.getEventById);
router.post('/:id/bookmark', requireAuth, eventController.toggleBookmark);
router.post('/', requireRole(['admin']), eventController.createEvent);
router.put('/:id', requireRole(['admin']), eventController.updateEvent);
router.delete('/:id', requireRole(['admin']), eventController.deleteEvent);

module.exports = router;
