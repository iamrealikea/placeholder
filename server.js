const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const { store } = require('./src/store/jsonStore');
const { generateSeedData, ensureTicketQrCodes } = require('./src/store/seed');
const { requireAuth } = require('./src/middleware/auth');

const authRoutes = require('./src/routes/auth.routes');
const eventsRoutes = require('./src/routes/events.routes');
const bookingRoutes = require('./src/routes/booking.routes');
const ticketsRoutes = require('./src/routes/tickets.routes');
const adminRoutes = require('./src/routes/admin.routes');
const supportRoutes = require('./src/routes/support.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static file directories
const publicDir = path.join(__dirname, 'public');
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadDir));

// Mount REST API routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);

// Customer notification endpoints (FR-35, FR-36)
const notificationsRouter = express.Router();
const getNotificationsHandler = (req, res) => {
  const notifs = store.find('notifications', (n) => n.userId === req.user.id);
  notifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json({
    total: notifs.length,
    notifications: notifs
  });
};
const markReadHandler = (req, res) => {
  const notif = store.findById('notifications', req.params.id);
  if (!notif || notif.userId !== req.user.id) {
    return res.status(404).json({ error: 'Notification not found.' });
  }
  const updated = store.update('notifications', notif.id, { isRead: true });
  return res.json({ message: 'Marked as read', notification: updated });
};

notificationsRouter.get('/', requireAuth, getNotificationsHandler);
notificationsRouter.get('/notifications', requireAuth, getNotificationsHandler);
notificationsRouter.put('/:id/read', requireAuth, markReadHandler);
notificationsRouter.put('/notifications/:id/read', requireAuth, markReadHandler);

app.use('/api/notifications', notificationsRouter);

// System health endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    system: 'TicketHub Platform',
    timestamp: new Date().toISOString()
  });
});

// Initialize database with seed data if fresh
store.init(generateSeedData);
ensureTicketQrCodes(store).catch((err) => console.error('QR Seed Error:', err.message));

// Background Scheduler: Releases expired 10-minute held seats every 15 seconds (FR-23)
const expirationInterval = setInterval(() => {
  store.expireHeldSeats();
}, 15000);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` TicketHub Server running on http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
}

module.exports = { app, expirationInterval };
