const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const { store } = require('./src/store/jsonStore');
const { generateSeedData, ensureTicketQrCodes } = require('./src/store/seed');

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
