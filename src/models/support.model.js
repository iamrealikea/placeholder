const { v4: uuidv4 } = require('uuid');
const { store } = require('../store/jsonStore');

class SupportModel {
  static findAll() {
    const list = [...store.getAll('support')];
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list;
  }

  static findById(id) {
    return store.findById('support', id);
  }

  static findByUserId(userId) {
    const list = store.find('support', (s) => s.userId === userId);
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list;
  }

  static create({ user, subject, category, message }) {
    const supportItem = {
      id: `sup-${uuidv4().slice(0, 8)}`,
      userId: user.id,
      name: user.name,
      email: user.email,
      subject: String(subject).trim(),
      category: category || 'General Inquiry',
      message: String(message).trim(),
      status: 'OPEN',
      adminReply: null,
      createdAt: new Date().toISOString()
    };
    return store.insert('support', supportItem);
  }

  static resolve(id, reply) {
    return store.update('support', id, {
      adminReply: String(reply).trim(),
      status: 'RESOLVED',
      repliedAt: new Date().toISOString()
    });
  }
}

module.exports = SupportModel;
