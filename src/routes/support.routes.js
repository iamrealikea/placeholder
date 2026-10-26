const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { store } = require('../store/jsonStore');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * FR-45: User Support & Inquiries
 */
router.post('/', requireAuth, (req, res) => {
  const { subject, category, message } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required.' });
  }

  const supportItem = {
    id: `sup-${uuidv4().slice(0, 8)}`,
    userId: req.user.id,
    name: req.user.name,
    email: req.user.email,
    subject: String(subject).trim(),
    category: category || 'General Inquiry',
    message: String(message).trim(),
    status: 'OPEN',
    adminReply: null,
    createdAt: new Date().toISOString()
  };

  store.insert('support', supportItem);

  return res.status(201).json({
    message: 'Support inquiry submitted successfully. Our team will review it shortly.',
    support: supportItem
  });
});

router.get('/my', requireAuth, (req, res) => {
  const list = store.find('support', (s) => s.userId === req.user.id);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json({ tickets: list });
});

router.get('/all', requireRole(['admin']), (_req, res) => {
  const list = store.getAll('support');
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json({ tickets: list });
});

router.put('/:id/reply', requireRole(['admin']), (req, res) => {
  const { reply } = req.body;
  if (!reply) {
    return res.status(400).json({ error: 'Reply text is required.' });
  }
  const item = store.findById('support', req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Support ticket not found.' });
  }

  const updated = store.update('support', item.id, {
    adminReply: String(reply).trim(),
    status: 'RESOLVED',
    repliedAt: new Date().toISOString()
  });

  // Notify user
  store.insert('notifications', {
    id: `ntf-${uuidv4().slice(0, 8)}`,
    userId: item.userId,
    channel: 'BOTH',
    type: 'SUPPORT_REPLY',
    subject: `Response to your inquiry: ${item.subject}`,
    message: `Admin reply: "${reply}"`,
    isRead: false,
    createdAt: new Date().toISOString()
  });

  return res.json({
    message: 'Reply sent and ticket resolved.',
    support: updated
  });
});

module.exports = router;
