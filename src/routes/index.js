const express = require('express');
const authRoutes = require('./auth.routes');
const eventsRoutes = require('./events.routes');
const categoriesRoutes = require('./categories.routes');
const bookingRoutes = require('./booking.routes');
const ticketsRoutes = require('./tickets.routes');
const adminRoutes = require('./admin.routes');
const supportRoutes = require('./support.routes');
const notificationsRoutes = require('./notifications.routes');
const viewRoutes = require('./view.routes');
const viewController = require('../controllers/view.controller');

const router = express.Router();

// REST API Routes
router.use('/api/auth', authRoutes);
router.use('/api/events', eventsRoutes);
router.use('/api/categories', categoriesRoutes);
router.use('/api/bookings', bookingRoutes);
router.use('/api/tickets', ticketsRoutes);
router.use('/api/admin', adminRoutes);
router.use('/api/support', supportRoutes);
router.use('/api/notifications', notificationsRoutes);
router.get('/api/health', viewController.getHealth);

// View Routes
router.use('/', viewRoutes);

module.exports = router;
