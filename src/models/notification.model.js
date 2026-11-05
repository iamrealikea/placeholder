const { v4: uuidv4 } = require('uuid');
const { store } = require('../store/jsonStore');

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
    const notif = {
      id: data.id || `ntf-${uuidv4().slice(0, 8)}`,
      userId: data.userId,
      channel: data.channel || 'BOTH',
      type: data.type,
      subject: data.subject,
      message: data.message,
      ...(data.emailTo !== undefined ? { emailTo: data.emailTo } : {}),
      isRead: Boolean(data.isRead),
      createdAt: data.createdAt || new Date().toISOString()
    };
    return store.insert('notifications', notif);
  }

  static markAsRead(id) {
    return store.update('notifications', id, { isRead: true });
  }
}

module.exports = NotificationModel;
