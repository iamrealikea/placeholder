const nodemailer = require('nodemailer');

function isEmailConfigured(env = process.env) {
  return Boolean(String(env.SMTP_HOST || '').trim() && String(env.EMAIL_FROM || '').trim());
}

function getTransportOptions(env) {
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
  }

  const user = String(env.SMTP_USER || '').trim();
  const pass = String(env.SMTP_PASS || '');
  if (Boolean(user) !== Boolean(pass)) {
    throw new Error('SMTP_USER and SMTP_PASS must be configured together.');
  }

  return {
    host: String(env.SMTP_HOST).trim(),
    port,
    secure: String(env.SMTP_SECURE || '').toLowerCase() === 'true',
    ...(user ? { auth: { user, pass } } : {})
  };
}

async function sendEmailNotification(notification, { env = process.env, createTransport = nodemailer.createTransport } = {}) {
  if (!isEmailConfigured(env)) {
    return { status: 'NOT_CONFIGURED' };
  }
  if (!notification.emailTo) {
    throw new Error('Notification email recipient is missing.');
  }

  const transporter = createTransport(getTransportOptions(env));
  await transporter.sendMail({
    from: String(env.EMAIL_FROM).trim(),
    to: notification.emailTo,
    subject: notification.subject || 'TicketHub notification',
    text: notification.message || ''
  });
  return { status: 'SENT' };
}

module.exports = {
  isEmailConfigured,
  sendEmailNotification
};
