const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const { store, SeatModel } = require('./src/models');
const { generateSeedData, ensureTicketQrCodes } = require('./src/store/seed');
const { resolveViewPath } = require('./src/views');
const appRoutes = require('./src/routes');

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

app.use(express.static(publicDir, { index: false }));
app.use('/uploads', express.static(uploadDir));

// Mount MVC API & View routes
app.use('/', appRoutes);

// Unmatched API paths get JSON 404; unmatched page paths get the 404 handle page
app.use('/api', (req, res) => res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` }));
app.use((req, res) => res.status(404).sendFile(resolveViewPath('error')));

// Errors thrown before a controller (bad JSON 400, body too large 413) as JSON, never with a stack trace
app.use((err, req, res, next) => {
  const status = err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(err);
  if (req.originalUrl && req.originalUrl.startsWith('/api')) {
    return res.status(status).json({ error: err.expose ? err.message : 'Internal server error.' });
  }
  return res.status(status).sendFile(resolveViewPath('error'));
});

// Initialize database with seed data if fresh
store.init(generateSeedData);
ensureTicketQrCodes(store).catch((err) => console.error('QR Seed Error:', err.message));

// Background Scheduler: Releases expired 10-minute held seats every 15 seconds (FR-23)
const expirationInterval = setInterval(() => {
  SeatModel.expireHeldSeats();
}, 15000);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` TicketHub Server running on http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
}

module.exports = { app, expirationInterval };
