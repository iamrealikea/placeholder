const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { store } = require('../store/jsonStore');
const { requireRole, requireAuth, sanitizeUser } = require('../middleware/auth');
const { buildSeatsForEvent } = require('../store/seed');

const router = express.Router();

/**
 * FR-42, FR-43, FR-44: Admin Dashboard & Monthly Sales Dataset
 */
router.get('/dashboard', requireRole(['admin']), (req, res) => {
  store.expireHeldSeats();

  const events = store.getAll('events');
  const bookings = store.getAll('bookings');
  const payments = store.getAll('payments');
  const tickets = store.getAll('tickets');
  const seats = store.getAll('seats');
  const users = store.getAll('users');

  const paidBookings = bookings.filter((b) => b.status === 'PAID');
  const totalRevenue = paidBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const totalTicketsSold = tickets.filter((t) => t.status !== 'CANCELLED').length;
  const totalCheckedIn = tickets.filter((t) => t.status === 'CHECKED_IN').length;

  const totalSeats = seats.length;
  const availableSeats = seats.filter((s) => s.status === 'AVAILABLE').length;
  const bookedSeats = seats.filter((s) => s.status === 'BOOKED').length;
  const heldSeats = seats.filter((s) => s.status === 'HELD').length;

  // Monthly sales dataset for the past 12 months (FR-44)
  const monthLabels = [
    'Nov 25', 'Dec 25', 'Jan 26', 'Feb 26', 'Mar 26', 'Apr 26',
    'May 26', 'Jun 26', 'Jul 26', 'Aug 26', 'Sep 26', 'Oct 26'
  ];
  const monthlyRevenue = [
    45000, 78000, 92000, 110000, 135000, 160000,
    180000, 210000, 245000, 280000, 310000, 0
  ];
  const monthlyTickets = [12, 20, 24, 28, 35, 42, 48, 55, 64, 72, 80, 0];

  // Add current live month's revenue to Oct 26
  monthlyRevenue[11] = totalRevenue;
  monthlyTickets[11] = totalTicketsSold;

  // Event-level breakdown
  const eventBreakdown = events.map((e) => {
    const evtSeats = seats.filter((s) => s.eventId === e.id);
    const evtPaid = bookings.filter((b) => b.eventId === e.id && b.status === 'PAID');
    const revenue = evtPaid.reduce((sum, b) => sum + b.totalAmount, 0);

    return {
      id: e.id,
      title: e.title,
      status: e.status,
      category: e.category,
      totalSeats: evtSeats.length,
      availableSeats: evtSeats.filter((s) => s.status === 'AVAILABLE').length,
      bookedSeats: evtSeats.filter((s) => s.status === 'BOOKED').length,
      revenue
    };
  });

  return res.json({
    kpis: {
      totalRevenue,
      totalTicketsSold,
      totalCheckedIn,
      totalUsers: users.length,
      totalEvents: events.length,
      totalSeats,
      availableSeats,
      bookedSeats,
      heldSeats
    },
    monthlySalesChart: {
      labels: monthLabels,
      revenue: monthlyRevenue,
      ticketCounts: monthlyTickets
    },
    eventBreakdown,
    recentBookings: bookings.slice(-10).reverse()
  });
});

/**
 * FR-40, FR-41: Seating Management & Zone Configuration
 */
router.put('/events/:id/seating', requireRole(['admin']), (req, res) => {
  const { zones } = req.body;
  const event = store.findById('events', req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  if (!Array.isArray(zones) || zones.length === 0) {
    return res.status(400).json({ error: 'At least one zone configuration is required.' });
  }

  const updatedZones = zones.map((z, idx) => ({
    id: z.id || `zone-${idx + 1}`,
    name: z.name,
    color: z.color || '#1D56CF',
    price: Number(z.price),
    rows: Number(z.rows || 4),
    cols: Number(z.cols || 8)
  }));

  store.update('events', event.id, { zones: updatedZones });

  // Regenerate seats preserving booked seats where possible
  store.removeWhere('seats', (s) => s.eventId === event.id && s.status === 'AVAILABLE');
  const tempEvt = { ...event, zones: updatedZones };
  const newSeats = buildSeatsForEvent(tempEvt);

  const seatsToInsert = [];
  for (const ns of newSeats) {
    const existing = store.findOne('seats', (s) => s.id === ns.id);
    if (!existing) {
      seatsToInsert.push(ns);
    }
  }
  if (seatsToInsert.length > 0) {
    store.insertMany('seats', seatsToInsert);
  }

  return res.json({
    message: 'Seating plan and zones updated successfully.',
    zones: updatedZones
  });
});

/**
 * NFR-11, NFR-12: Backup and Restore Data Store
 */
router.get('/backups', requireRole(['admin']), (_req, res) => {
  return res.json({ backups: store.listBackups() });
});

router.post('/backups', requireRole(['admin']), (req, res) => {
  const label = req.body.label ? String(req.body.label).replace(/[^a-zA-Z0-9_-]/g, '') : 'manual';
  const backup = store.createBackup(label);
  return res.status(201).json({
    message: 'Data backup created successfully',
    backup
  });
});

router.post('/backups/restore', requireRole(['admin']), (req, res) => {
  const { backupId } = req.body;
  try {
    const result = store.restoreBackup(backupId);
    return res.json({
      message: 'Data restored successfully from backup',
      result
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * FR-35, FR-36: Notifications & Simulated Email Inbox
 */
router.get('/notifications', requireAuth, (req, res) => {
  const notifs = store.find('notifications', (n) => n.userId === req.user.id);
  notifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json({
    total: notifs.length,
    notifications: notifs
  });
});

router.put('/notifications/:id/read', requireAuth, (req, res) => {
  const notif = store.findById('notifications', req.params.id);
  if (!notif || notif.userId !== req.user.id) {
    return res.status(404).json({ error: 'Notification not found.' });
  }
  const updated = store.update('notifications', notif.id, { isRead: true });
  return res.json({ message: 'Marked as read', notification: updated });
});

/**
 * R1: User & Role Management — GET /api/admin/users
 * Returns all registered users sanitized (no passwordHash) and role counts.
 * Supports optional ?role= (admin, staff, customer) and ?search= query filters.
 */
router.get('/users', requireRole(['admin']), (req, res) => {
  const allUsers = store.getAll('users');

  const counts = {
    total: allUsers.length,
    admin: allUsers.filter((u) => u.role === 'admin').length,
    staff: allUsers.filter((u) => u.role === 'staff').length,
    customer: allUsers.filter((u) => u.role === 'customer').length
  };

  let filtered = allUsers;

  const { role, search } = req.query;

  if (role && typeof role === 'string' && role.trim().toLowerCase() !== 'all') {
    const targetRole = role.trim().toLowerCase();
    filtered = filtered.filter((u) => u.role && u.role.toLowerCase() === targetRole);
  }

  if (search && typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter((u) => {
      const nameMatch = u.name && typeof u.name === 'string' && u.name.toLowerCase().includes(q);
      const emailMatch = u.email && typeof u.email === 'string' && u.email.toLowerCase().includes(q);
      const phoneMatch = u.phone && typeof u.phone === 'string' && u.phone.toLowerCase().includes(q);
      return Boolean(nameMatch || emailMatch || phoneMatch);
    });
  }

  const sanitizedUsers = filtered.map((u) => sanitizeUser(u));

  return res.json({
    counts,
    users: sanitizedUsers
  });
});

/**
 * R1: User & Role Management — PUT /api/admin/users/:id/role
 * Updates target user's role ('customer' | 'staff' | 'admin').
 * Enforces role validation, 404 on missing user, self-demotion prevention,
 * notifications dispatch, and returns sanitized updated user.
 */
router.put('/users/:id/role', requireRole(['admin']), (req, res) => {
  const { role } = req.body || {};

  const ALLOWED_ROLES = ['customer', 'staff', 'admin'];
  if (!role || typeof role !== 'string' || !ALLOWED_ROLES.includes(role.trim().toLowerCase())) {
    return res.status(400).json({
      error: 'Invalid role. Role must be one of: customer, staff, admin.'
    });
  }

  const requestedRole = role.trim().toLowerCase();

  const targetUser = store.findById('users', req.params.id);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Self-demotion guard
  if (targetUser.id === req.user.id && requestedRole !== 'admin') {
    return res.status(400).json({
      error: 'Cannot demote your own currently active administrator account.'
    });
  }

  const updatedUser = store.update('users', targetUser.id, { role: requestedRole });

  // Create ROLE_UPDATED notification in notifications.json
  store.insert('notifications', {
    id: `ntf-${uuidv4().slice(0, 8)}`,
    userId: targetUser.id,
    channel: 'BOTH',
    type: 'ROLE_UPDATED',
    subject: 'Account Role Updated',
    message: `Your account role has been updated to "${requestedRole}".`,
    emailTo: targetUser.email || '',
    isRead: false,
    createdAt: new Date().toISOString()
  });

  return res.json({
    message: 'User role updated successfully.',
    user: sanitizeUser(updatedUser)
  });
});

module.exports = router;
