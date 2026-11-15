const { SupportModel, NotificationModel } = require('../models');

/**
 * FR-45: User Support & Inquiries
 * POST /api/support
 */
function createInquiry(req, res) {
  const { subject, category, message } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required.' });
  }

  const supportItem = SupportModel.create({
    user: req.user,
    subject,
    category,
    message
  });

  return res.status(201).json({
    message: 'Support inquiry submitted successfully. Our team will review it shortly.',
    support: supportItem
  });
}

/**
 * GET /api/support/my
 */
function getMyInquiries(req, res) {
  const list = SupportModel.findByUserId(req.user.id);
  return res.json({ tickets: list });
}

/**
 * GET /api/support/all
 */
function getAllInquiries(_req, res) {
  const list = SupportModel.findAll();
  return res.json({ tickets: list });
}

/**
 * PUT /api/support/:id/reply
 */
function replyInquiry(req, res) {
  const { reply } = req.body;
  if (!reply) {
    return res.status(400).json({ error: 'Reply text is required.' });
  }
  const item = SupportModel.findById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Support ticket not found.' });
  }

  const updated = SupportModel.resolve(item.id, reply);

  NotificationModel.create({
    userId: item.userId,
    channel: 'BOTH',
    type: 'SUPPORT_REPLY',
    subject: `Response to your inquiry: ${item.subject}`,
    message: `Admin reply: "${reply}"`
  });

  return res.json({
    message: 'Reply sent and ticket resolved.',
    support: updated
  });
}

module.exports = {
  createInquiry,
  getMyInquiries,
  getAllInquiries,
  replyInquiry
};
