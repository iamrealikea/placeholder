const express = require('express');
const { requireAuth } = require('../middleware/auth');
const notificationController = require('../controllers/notification.controller');

const router = express.Router();

router.get('/', requireAuth, notificationController.getNotifications);
router.get('/notifications', requireAuth, notificationController.getNotifications);
router.put('/:id/read', requireAuth, notificationController.markNotificationRead);
router.put('/notifications/:id/read', requireAuth, notificationController.markNotificationRead);

module.exports = router;
