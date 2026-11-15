const { NotificationModel } = require('../models');

/**
 * FR-35, FR-36: Notifications & Simulated Email Inbox
 * GET /api/notifications (and /api/admin/notifications)
 */
function getNotifications(req, res) {
  const notifs = NotificationModel.findByUserId(req.user.id);
  return res.json({
    total: notifs.length,
    notifications: notifs
  });
}

/**
 * PUT /api/notifications/:id/read (and /api/admin/notifications/:id/read)
 */
function markNotificationRead(req, res) {
  const notif = NotificationModel.findById(req.params.id);
  if (!notif || notif.userId !== req.user.id) {
    return res.status(404).json({ error: 'Notification not found.' });
  }
  const updated = NotificationModel.markAsRead(notif.id);
  return res.json({ message: 'Marked as read', notification: updated });
}

module.exports = {
  getNotifications,
  markNotificationRead
};
