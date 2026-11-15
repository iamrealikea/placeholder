const assert = require('node:assert/strict');
const test = require('node:test');
const { sendEmailNotification } = require('../src/services/email.service');

const notification = {
  emailTo: 'buyer@example.com',
  subject: 'Payment confirmed',
  message: 'Your payment was successful.'
};

test('reports when SMTP is not configured', async () => {
  const result = await sendEmailNotification(notification, { env: {} });
  assert.deepStrictEqual(result, { status: 'NOT_CONFIGURED' });
});

test('sends an email through the configured SMTP transport', async () => {
  let transportOptions;
  let message;

  const result = await sendEmailNotification(notification, {
    env: {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'mailer',
      SMTP_PASS: 'test-password',
      EMAIL_FROM: 'TicketHub <tickets@example.com>'
    },
    createTransport(options) {
      transportOptions = options;
      return {
        async sendMail(mail) {
          message = mail;
        }
      };
    }
  });

  assert.deepStrictEqual(result, { status: 'SENT' });
  assert.deepStrictEqual(transportOptions, {
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    auth: { user: 'mailer', pass: 'test-password' }
  });
  assert.deepStrictEqual(message, {
    from: 'TicketHub <tickets@example.com>',
    to: notification.emailTo,
    subject: notification.subject,
    text: notification.message
  });
});

test('rejects invalid SMTP configuration and missing recipients', async () => {
  const env = {
    SMTP_HOST: 'smtp.example.com',
    EMAIL_FROM: 'tickets@example.com',
    SMTP_PORT: 'invalid'
  };
  const createTransport = () => ({ sendMail: async () => {} });

  await assert.rejects(
    sendEmailNotification(notification, { env, createTransport }),
    /SMTP_PORT must be an integer/
  );
  await assert.rejects(
    sendEmailNotification({ ...notification, emailTo: '' }, { env: { ...env, SMTP_PORT: '587' }, createTransport }),
    /recipient is missing/
  );
});
