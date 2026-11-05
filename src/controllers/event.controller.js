const {
  EventModel,
  SeatModel,
  UserModel,
  BookingModel,
  NotificationModel
} = require('../models');

/**
 * FR-06, FR-07, FR-08, FR-09, FR-10: List, search, filter, popular events
 * GET /api/events
 */
function listEvents(req, res) {
  SeatModel.expireHeldSeats();
  const list = EventModel.findAll(req.query);
  const userBookmarks = req.user && req.user.bookmarks ? req.user.bookmarks : [];

  const results = list.map((e) => {
    const roundAvailability = (e.rounds || []).map((r) => ({
      roundId: r.id,
      date: r.date,
      time: r.time,
      label: r.label,
      zones: SeatModel.getZoneSeatAvailability(e.id, r.id)
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
}

/**
 * FR-12, FR-20: Event Details with Zone Availability
 * GET /api/events/:id
 */
function getEventById(req, res) {
  SeatModel.expireHeldSeats();
  const event = EventModel.findById(req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const userBookmarks = req.user && req.user.bookmarks ? req.user.bookmarks : [];
  const roundsWithZones = (event.rounds || []).map((r) => ({
    ...r,
    zones: SeatModel.getZoneSeatAvailability(event.id, r.id)
  }));

  const isSaleOpen = EventModel.isSaleOpen(event);

  return res.json({
    event: {
      ...event,
      isBookmarked: userBookmarks.includes(event.id),
      isSaleOpen,
      rounds: roundsWithZones
    }
  });
}

/**
 * FR-11: Bookmark / Unbookmark Event
 * POST /api/events/:id/bookmark
 */
function toggleBookmark(req, res) {
  const event = EventModel.findById(req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const result = UserModel.toggleBookmark(req.user.id, event.id);

  return res.json({
    message: result.isBookmarked ? 'Event bookmarked' : 'Event removed from bookmarks',
    isBookmarked: result.isBookmarked,
    bookmarks: result.bookmarks
  });
}

/**
 * FR-13, FR-48: Create Event (Admin)
 * POST /api/events
 */
function createEvent(req, res) {
  const { title, category, venue, rounds, zones } = req.body;

  if (!title || !category || !venue || !rounds || !rounds.length || !zones || !zones.length) {
    return res.status(400).json({ error: 'Title, category, venue, rounds, and zones are required.' });
  }

  const newEvent = EventModel.create(req.body);
  const seats = SeatModel.generateForEvent(newEvent);

  return res.status(201).json({
    message: 'Event and seating layout created successfully',
    event: newEvent,
    totalSeatsGenerated: seats.length
  });
}

/**
 * FR-14, FR-34, FR-37, FR-48: Edit Event (Admin)
 * PUT /api/events/:id
 */
function updateEvent(req, res) {
  const existing = EventModel.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const updates = { ...req.body };
  delete updates.id;

  const dateOrVenueChanged =
    (updates.venue && updates.venue !== existing.venue) ||
    (updates.showTime && updates.showTime !== existing.showTime) ||
    (updates.rounds && JSON.stringify(updates.rounds) !== JSON.stringify(existing.rounds));

  const updated = EventModel.update(existing.id, updates);

  // FR-34: Dispatches notification to users when event details change
  if (dateOrVenueChanged) {
    const bookings = BookingModel.findPaidByEventId(existing.id);
    const userIds = Array.from(new Set(bookings.map((b) => b.userId)));
    for (const uid of userIds) {
      NotificationModel.create({
        userId: uid,
        channel: 'BOTH',
        type: 'EVENT_CHANGE',
        subject: `Update on ${updated.title}`,
        message: `Important update regarding ${updated.title}: Venue is now "${updated.venue}", showtime "${updated.showTime}". Please review your ticket details.`
      });
    }
  }

  // FR-37: Bookmark notification if status moved to 'On Sale'
  if (existing.status !== 'On Sale' && updated.status === 'On Sale') {
    const allUsers = UserModel.findAll();
    for (const u of allUsers) {
      if ((u.bookmarks || []).includes(updated.id)) {
        NotificationModel.create({
          userId: u.id,
          channel: 'BOTH',
          type: 'BOOKMARK_ALERT',
          subject: `Tickets Now On Sale: ${updated.title}`,
          message: `Great news! "${updated.title}" has opened ticket sales. Book your seats now!`
        });
      }
    }
  }

  return res.json({
    message: 'Event updated successfully',
    event: updated
  });
}

/**
 * FR-15: Delete Event (Admin)
 * DELETE /api/events/:id
 */
function deleteEvent(req, res) {
  const event = EventModel.findById(req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  if (BookingModel.hasPaidBookings(event.id)) {
    return res.status(400).json({
      error: 'Cannot delete event with active paid bookings. You must cancel/refund tickets first.'
    });
  }

  EventModel.remove(event.id);
  SeatModel.removeByEvent(event.id);
  return res.json({ message: 'Event and seat records deleted successfully.' });
}

module.exports = {
  listEvents,
  getEventById,
  toggleBookmark,
  createEvent,
  updateEvent,
  deleteEvent
};
