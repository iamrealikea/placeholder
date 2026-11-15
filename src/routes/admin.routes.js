const express = require('express');
const { requireRole, requireAuth } = require('../middleware/auth');
const adminController = require('../controllers/admin.controller');
const notificationController = require('../controllers/notification.controller');

const router = express.Router();

router.get('/dashboard', requireRole(['admin']), adminController.getDashboard);
router.get('/events/:id/inspect', requireRole(['admin']), adminController.inspectEvent);
router.put('/events/:id/seating', requireRole(['admin']), adminController.updateEventSeating);
router.get('/transactions', requireRole(['admin']), adminController.listTransactions);

router.get('/backups', requireRole(['admin']), adminController.listBackups);
router.post('/backups', requireRole(['admin']), adminController.createBackup);
router.post('/backups/restore', requireRole(['admin']), adminController.restoreBackup);

router.get('/notifications', requireAuth, notificationController.getNotifications);
router.put('/notifications/:id/read', requireAuth, notificationController.markNotificationRead);

router.get('/users', requireRole(['admin']), adminController.listUsers);
router.put('/users/:id/role', requireRole(['admin']), adminController.updateUserRole);

module.exports = router;
