const { v4: uuidv4 } = require('uuid');
const { store } = require('../store/jsonStore');
const UserModel = require('./user.model');
const { isEmailConfigured, sendEmailNotification } = require('../services/email.service');

class NotificationModel {
  static findById(id) {
    return store.findById('notifications', id);
  }

  static findByUserId(userId) {
    const notifs = store.find('notifications', (n) => n.userId === userId);
    notifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return notifs;
  }

  static create(data) {
    const channel = data.channel || 'BOTH';
    const user = data.userId ? UserModel.findById(data.userId) : null;
    const emailTo = data.emailTo || (user && user.email);
    const emailRequested = channel === 'EMAIL' || channel === 'BOTH';
    const emailStatus = !emailRequested
      ? 'NOT_REQUESTED'
      : !emailTo
      ? 'FAILED'
      : isEmailConfigured()
      ? 'PENDING'
      : 'NOT_CONFIGURED';

    const notif = {
      id: data.id || `ntf-${uuidv4().slice(0, 8)}`,
      userId: data.userId,
      channel,
      type: data.type,
      subject: data.subject,
      message: data.message,
      ...(emailTo !== undefined ? { emailTo } : {}),
      emailStatus,
      isRead: Boolean(data.isRead),
      createdAt: data.createdAt || new Date().toISOString()
    };

    store.insert('notifications', notif);
    if (emailStatus === 'PENDING') {
      sendEmailNotification(notif)
        .then(() => {
          store.update('notifications', notif.id, {
            emailStatus: 'SENT',
            emailSentAt: new Date().toISOString()
          });
        })
        .catch((error) => {
          store.update('notifications', notif.id, { emailStatus: 'FAILED' });
          console.error(`Email delivery failed for notification ${notif.id}: ${error.message}`);
        });
    } else if (emailStatus === 'FAILED') {
      console.error(`Email delivery skipped for notification ${notif.id}: recipient address is missing.`);
    }

    return notif;
  }

  static markAsRead(id) {
    return store.update('notifications', id, { isRead: true });
  }
}

module.exports = NotificationModel;
