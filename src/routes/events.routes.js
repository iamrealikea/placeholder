const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { store } = require('../store/jsonStore');
const { optionalAuth, requireAuth, requireRole } = require('../middleware/auth');
const { buildSeatsForEvent } = require('../store/seed');

const router = express.Router();

function getZoneSeatAvailability(eventId, roundId) {
  store.expireHeldSeats();
  const seats = store.find(
    'seats',
    (s) => s.eventId === eventId && (!roundId || s.roundId === roundId)
  );

  const zoneMap = {};
  for (const s of seats) {
    if (!zoneMap[s.zoneId]) {
      zoneMap[s.zoneId] = {
        zoneId: s.zoneId,
        zoneName: s.zoneName,
        zoneColor: s.zoneColor,
        price: s.price,
        totalSeats: 0,
        availableSeats: 0,
        heldSeats: 0,
        bookedSeats: 0
      };
    }
    zoneMap[s.zoneId].totalSeats++;
    if (s.status === 'AVAILABLE') zoneMap[s.zoneId].availableSeats++;
    else if (s.status === 'HELD') zoneMap[s.zoneId].heldSeats++;
    else if (s.status === 'BOOKED') zoneMap[s.zoneId].bookedSeats++;
  }
  return Object.values(zoneMap);
}

/**
 * FR-06, FR-07, FR-08, FR-09, FR-10: List, search, filter, popular events
 */
router.get('/', optionalAuth, (req, res) => {
  store.expireHeldSeats();
  const { search, category, status, date, artist, featured, saleActive } = req.query;

  let list = store.getAll('events');

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(
      (e) =>
        (e.title && e.title.toLowerCase().includes(q)) ||
        (e.artist && e.artist.toLowerCase().includes(q)) ||
        (e.venue && e.venue.toLowerCase().includes(q))
    );
  }

  if (category) {
    list = list.filter((e) => e.category.toLowerCase() === String(category).toLowerCase());
  }

  if (status) {
    list = list.filter((e) => e.status.toLowerCase() === String(status).toLowerCase());
  }

  if (artist) {
    const a = String(artist).toLowerCase();
    list = list.filter((e) => e.artist && e.artist.toLowerCase().includes(a));
  }

  if (date) {
    list = list.filter((e) => (e.rounds || []).some((r) => r.date === date));
  }

  if (featured === 'true') {
    list = list.filter((e) => e.isFeatured);
  }

  const now = new Date();
  if (saleActive === 'true') {
    list = list.filter((e) => {
      const start = new Date(e.saleStartAt);
      const end = new Date(e.saleEndAt);
      return now >= start && now <= end && e.status === 'On Sale';
    });
  }

  const userBookmarks = req.user && req.user.bookmarks ? req.user.bookmarks : [];

  const results = list.map((e) => {
    const roundAvailability = (e.rounds || []).map((r) => ({
      roundId: r.id,
      date: r.date,
      time: r.time,
      label: r.label,
      zones: getZoneSeatAvailability(e.id, r.id)
    }));

    const totalAvailable = roundAvailability.reduce(
      (sum, r) => sum + r.zones.reduce((zSum, z) => zSum + z.availableSeats, 0),
      0
    );

    return {
      ...e,
      isBookmarked: userBookmarks.includes(e.id),
      totalAvailableSeats: totalAvailable,
      roundsSummary: roundAvailability
    };
  });

  return res.json({
    total: results.length,
    events: results
  });
});

/**
 * FR-12, FR-20: Event Details with Zone Availability
 */
router.get('/:id', optionalAuth, (req, res) => {
  store.expireHeldSeats();
  const event = store.findById('events', req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const userBookmarks = req.user && req.user.bookmarks ? req.user.bookmarks : [];
  const roundsWithZones = (event.rounds || []).map((r) => ({
    ...r,
    zones: getZoneSeatAvailability(event.id, r.id)
  }));

  const now = new Date();
  const saleStart = new Date(event.saleStartAt);
  const saleEnd = new Date(event.saleEndAt);
  const isSaleOpen = now >= saleStart && now <= saleEnd && event.status === 'On Sale';

  return res.json({
    event: {
      ...event,
      isBookmarked: userBookmarks.includes(event.id),
      isSaleOpen,
      rounds: roundsWithZones
    }
  });
});

/**
 * FR-11: Bookmark / Unbookmark Event
 */
router.post('/:id/bookmark', requireAuth, (req, res) => {
  const event = store.findById('events', req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const user = store.findById('users', req.user.id);
  const bookmarks = new Set(user.bookmarks || []);
  let bookmarked = false;

  if (bookmarks.has(event.id)) {
    bookmarks.delete(event.id);
    bookmarked = false;
  } else {
    bookmarks.add(event.id);
    bookmarked = true;
  }

  user.bookmarks = Array.from(bookmarks);
  store.update('users', user.id, { bookmarks: user.bookmarks });

  return res.json({
    message: bookmarked ? 'Event bookmarked' : 'Event removed from bookmarks',
    isBookmarked: bookmarked,
    bookmarks: user.bookmarks
  });
});

/**
 * FR-13, FR-48: Create Event (Admin)
 */
router.post('/', requireRole(['admin']), (req, res) => {
  const {
    title,
    artist,
    category,
    status,
    posterUrl,
    galleryUrl,
    description,
    venue,
    organizer,
    gateOpenTime,
    showTime,
    saleStartAt,
    saleEndAt,
    rounds,
    zones,
    isFeatured
  } = req.body;

  if (!title || !category || !venue || !rounds || !rounds.length || !zones || !zones.length) {
    return res.status(400).json({ error: 'Title, category, venue, rounds, and zones are required.' });
  }

  const newEvent = {
    id: `evt-${uuidv4().slice(0, 8)}`,
    title: String(title).trim(),
    artist: String(artist || '').trim(),
    category: category || 'Concert',
    status: status || 'On Sale',
    isFeatured: Boolean(isFeatured),
    posterUrl: posterUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    galleryUrl: galleryUrl || 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=900&q=80',
    description: description || '',
    venue: venue || 'Main Arena',
    organizer: organizer || 'TicketHub Organizer',
    gateOpenTime: gateOpenTime || '16:00',
    showTime: showTime || '19:00',
    saleStartAt: saleStartAt || new Date().toISOString(),
    saleEndAt: saleEndAt || new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    maxTicketsPerUser: 6,
    allowCancellation: true,
    refundPolicyPct: 100,
    rounds: rounds.map((r, idx) => ({
      id: r.id || `rnd-${idx + 1}`,
      date: r.date,
      time: r.time,
      label: r.label || `${r.date} • ${r.time}`
    })),
    zones: zones.map((z, idx) => ({
      id: z.id || `zone-${idx + 1}`,
      name: z.name,
      color: z.color || '#1D56CF',
      price: Number(z.price),
      rows: Number(z.rows || 4),
      cols: Number(z.cols || 8)
    })),
    createdAt: new Date().toISOString()
  };

  store.insert('events', newEvent);
  const seats = buildSeatsForEvent(newEvent);
  store.insertMany('seats', seats);

  return res.status(201).json({
    message: 'Event and seating layout created successfully',
    event: newEvent,
    totalSeatsGenerated: seats.length
  });
});

/**
 * FR-14, FR-34, FR-37, FR-48: Edit Event (Admin)
 */
router.put('/:id', requireRole(['admin']), (req, res) => {
  const existing = store.findById('events', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const updates = { ...req.body };
  delete updates.id;

  const dateOrVenueChanged =
    (updates.venue && updates.venue !== existing.venue) ||
    (updates.showTime && updates.showTime !== existing.showTime) ||
    (updates.rounds && JSON.stringify(updates.rounds) !== JSON.stringify(existing.rounds));

  const updated = store.update('events', existing.id, updates);

  // FR-34: Dispatches notification to users when event details change
  if (dateOrVenueChanged) {
    const bookings = store.find('bookings', (b) => b.eventId === existing.id && b.status === 'PAID');
    const userIds = Array.from(new Set(bookings.map((b) => b.userId)));
    for (const uid of userIds) {
      store.insert('notifications', {
        id: `ntf-${uuidv4().slice(0, 8)}`,
        userId: uid,
        channel: 'BOTH',
        type: 'EVENT_CHANGE',
        subject: `Update on ${updated.title}`,
        message: `Important update regarding ${updated.title}: Venue is now "${updated.venue}", showtime "${updated.showTime}". Please review your ticket details.`,
        isRead: false,
        createdAt: new Date().toISOString()
      });
    }
  }

  // FR-37: Bookmark notification if status moved to 'On Sale'
  if (existing.status !== 'On Sale' && updated.status === 'On Sale') {
    const allUsers = store.getAll('users');
    for (const u of allUsers) {
      if ((u.bookmarks || []).includes(updated.id)) {
        store.insert('notifications', {
          id: `ntf-${uuidv4().slice(0, 8)}`,
          userId: u.id,
          channel: 'BOTH',
          type: 'BOOKMARK_ALERT',
          subject: `Tickets Now On Sale: ${updated.title}`,
          message: `Great news! "${updated.title}" has opened ticket sales. Book your seats now!`,
          isRead: false,
          createdAt: new Date().toISOString()
        });
      }
    }
  }

  return res.json({
    message: 'Event updated successfully',
    event: updated
  });
});

/**
 * FR-15: Delete Event (Admin)
 */
router.delete('/:id', requireRole(['admin']), (req, res) => {
  const event = store.findById('events', req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const hasPaidBookings = store.findOne(
    'bookings',
    (b) => b.eventId === event.id && b.status === 'PAID'
  );
  if (hasPaidBookings) {
    return res.status(400).json({
      error: 'Cannot delete event with active paid bookings. You must cancel/refund tickets first.'
    });
  }

  store.remove('events', event.id);
  store.removeWhere('seats', (s) => s.eventId === event.id);
  return res.json({ message: 'Event and seat records deleted successfully.' });
});

module.exports = router;
