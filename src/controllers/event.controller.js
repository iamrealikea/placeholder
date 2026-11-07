const bcrypt = require('bcryptjs');
const {
  EventModel,
  SeatModel,
  UserModel,
  BookingModel,
  NotificationModel
} = require('../models');
const { store } = require('../store/jsonStore');
const { getAllTemplates } = require('../store/seatTemplates');
const { cancelAndRefundBooking } = require('./booking.controller');

// In-memory tracker for failed delete password attempts (per-admin rate throttle: 5 failed attempts in 10 minutes)
const failedDeleteAttempts = new Map(); // key: String(adminId) -> Array<number> timestamps

function isDeleteRateThrottled(adminId) {
  if (!adminId) return false;
  const key = String(adminId);
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutes
  const timestamps = (failedDeleteAttempts.get(key) || []).filter((ts) => now - ts < windowMs);
  failedDeleteAttempts.set(key, timestamps);
  return timestamps.length >= 5;
}

function recordDeleteFailedAttempt(adminId) {
  if (!adminId) return;
  const key = String(adminId);
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const timestamps = (failedDeleteAttempts.get(key) || []).filter((ts) => now - ts < windowMs);
  timestamps.push(now);
  failedDeleteAttempts.set(key, timestamps);
}

function clearDeleteFailedAttempts(adminId) {
  if (adminId) {
    failedDeleteAttempts.delete(String(adminId));
  } else {
    failedDeleteAttempts.clear();
  }
}

// Hook into store.resetWithSeed to clear throttle when test resets database
const origResetWithSeed = store.resetWithSeed.bind(store);
store.resetWithSeed = function (...args) {
  failedDeleteAttempts.clear();
  return origResetWithSeed(...args);
};

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const VALID_CATEGORIES = ['concert', 'seminar'];

/**
 * Validates event creation or update payload against strict invariants:
 * - Category must be strictly 'Concert' or 'Seminar'
 * - Hex colors must match /^#[0-9a-fA-F]{6}$/
 * - Prices must be finite numbers >= 0 (0 allowed)
 * - Seat capacity cap: <= 2000 seats per zone
 * - Seat coordinates x, y must be numeric
 * - Unique seat labels per zone
 */
function validateEventPayload(payload, { isUpdate = false } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'Event payload must be a JSON object.' };
  }

  // 1. Title validation
  if (!isUpdate || payload.title !== undefined) {
    if (!payload.title || typeof payload.title !== 'string' || !payload.title.trim()) {
      return { valid: false, error: 'Event title is required.' };
    }
  }

  // 2. Category validation (strictly Concert or Seminar)
  if (!isUpdate || payload.category !== undefined) {
    if (
      !payload.category ||
      typeof payload.category !== 'string' ||
      !VALID_CATEGORIES.includes(payload.category.trim().toLowerCase())
    ) {
      return { valid: false, error: 'Category must be either Concert or Seminar.' };
    }
  }

  // 3. Venue validation
  if (!isUpdate || payload.venue !== undefined) {
    if (!payload.venue || typeof payload.venue !== 'string' || !payload.venue.trim()) {
      return { valid: false, error: 'Venue is required.' };
    }
  }

  // 4. Rounds validation
  if (!isUpdate || payload.rounds !== undefined) {
    if (!Array.isArray(payload.rounds) || payload.rounds.length === 0) {
      return { valid: false, error: 'At least one round is required.' };
    }
    for (const r of payload.rounds) {
      if (!r || typeof r !== 'object') {
        return { valid: false, error: 'Invalid round format.' };
      }
    }
  }

  // 5. Zones validation
  if (!isUpdate || payload.zones !== undefined) {
    if (!Array.isArray(payload.zones) || payload.zones.length === 0) {
      return { valid: false, error: 'At least one zone configuration is required.' };
    }

    for (let i = 0; i < payload.zones.length; i++) {
      const z = payload.zones[i];
      if (!z || typeof z !== 'object') {
        return { valid: false, error: `Zone at index ${i} is invalid.` };
      }

      // Zone name
      if (!isUpdate || z.name !== undefined) {
        if (!z.name || typeof z.name !== 'string' || !z.name.trim()) {
          return { valid: false, error: `Zone name is required for zone ${i + 1}.` };
        }
      }

      // Zone color: must match /^#[0-9a-fA-F]{6}$/
      if (z.color !== undefined && z.color !== null) {
        if (typeof z.color !== 'string' || !HEX_COLOR_REGEX.test(z.color.trim())) {
          return { valid: false, error: `Zone color "${z.color}" must be a valid 6-character hex code (e.g. #1D56CF).` };
        }
      }

      // Zone price: non-negative finite number (0 allowed)
      if (z.price !== undefined && z.price !== null) {
        if (typeof z.price === 'string' && isNaN(Number(z.price))) {
          return { valid: false, error: `Zone price "${z.price}" must be a valid non-negative number.` };
        }
        const p = Number(z.price);
        if (!Number.isFinite(p) || p < 0) {
          return { valid: false, error: 'Zone price must be a valid non-negative number.' };
        }
      }

      // Capacity & Seat Layout
      if (Array.isArray(z.seats) && z.seats.length > 0) {
        if (z.seats.length > 2000) {
          return { valid: false, error: `Zone "${z.name || i + 1}" exceeds maximum capacity of 2000 seats.` };
        }

        const labelSet = new Set();
        for (const s of z.seats) {
          if (!s || typeof s !== 'object') {
            return { valid: false, error: 'Invalid seat object in zone.' };
          }
          const label = String(s.label || s.seatNumber || '').trim();
          if (!label) {
            return { valid: false, error: 'Seat label is required.' };
          }
          if (labelSet.has(label)) {
            return { valid: false, error: `Duplicate seat label "${label}" in zone "${z.name}".` };
          }
          labelSet.add(label);

          if (s.x !== undefined && s.x !== null) {
            if ((typeof s.x === 'string' && isNaN(Number(s.x))) || !Number.isFinite(Number(s.x))) {
              return { valid: false, error: 'Seat coordinates x and y must be numeric.' };
            }
          }
          if (s.y !== undefined && s.y !== null) {
            if ((typeof s.y === 'string' && isNaN(Number(s.y))) || !Number.isFinite(Number(s.y))) {
              return { valid: false, error: 'Seat coordinates x and y must be numeric.' };
            }
          }
          if (s.color) {
            if (typeof s.color !== 'string' || !HEX_COLOR_REGEX.test(s.color.trim())) {
              return { valid: false, error: 'Seat color override must be a valid 6-character hex code.' };
            }
          }
        }
      } else {
        // Matrix mode
        const rows = z.rows !== undefined ? Number(z.rows) : 4;
        const cols = z.cols !== undefined ? Number(z.cols) : 8;
        if (!Number.isFinite(rows) || rows < 1 || !Number.isFinite(cols) || cols < 1) {
          return { valid: false, error: 'Rows and columns must be positive numbers.' };
        }
        if (rows * cols > 2000) {
          return { valid: false, error: `Zone "${z.name || i + 1}" exceeds maximum capacity of 2000 seats.` };
        }
        if (z.originX !== undefined && z.originX !== null && !Number.isFinite(Number(z.originX))) {
          return { valid: false, error: 'originX must be numeric.' };
        }
        if (z.originY !== undefined && z.originY !== null && !Number.isFinite(Number(z.originY))) {
          return { valid: false, error: 'originY must be numeric.' };
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Detects whether incoming zones or rounds represent a structural layout modification.
 * Changing price, color, or name is non-structural.
 * Changing rows, cols, originX/Y, seat coordinates/labels, or zone/round structure is structural.
 *
 * Supports both signatures:
 * - isLayoutModified(existingEvent, updates)
 * - isLayoutModified(existingZones, incomingZones)
 */
function isLayoutModified(existing = [], incoming = []) {
  let existingZones = existing;
  let incomingZones = incoming;

  // Handle event object signature: isLayoutModified(existingEvent, updates)
  if (existing && !Array.isArray(existing) && typeof existing === 'object') {
    const existingEvent = existing;
    const updates = incoming || {};

    // 1. Check round structural changes if incoming payload includes rounds
    if (Array.isArray(updates.rounds)) {
      const er = Array.isArray(existingEvent.rounds) ? existingEvent.rounds : [];
      if (updates.rounds.length !== er.length) return true;
      for (let i = 0; i < updates.rounds.length; i++) {
        const ur = updates.rounds[i];
        const existingRound = er[i];
        if (!ur || !existingRound) return true;
        if (!ur.id || ur.id !== existingRound.id) return true;
      }
    }

    // If incoming payload does not specify zones, and rounds were unchanged, layout is not modified
    if (!Array.isArray(updates.zones)) {
      return false;
    }

    existingZones = existingEvent.zones || [];
    incomingZones = updates.zones;
  }

  if (!Array.isArray(incomingZones)) return false;
  if (!Array.isArray(existingZones)) return true;

  // 2. Zone count modification (omission, reduction, addition) is structural
  if (incomingZones.length !== existingZones.length) return true;

  const existingIdMap = new Map();
  const existingNameMap = new Map();
  for (const ez of existingZones) {
    if (ez && ez.id) existingIdMap.set(ez.id, ez);
    if (ez && ez.name) existingNameMap.set(ez.name, ez);
  }

  const matchedExistingKeys = new Set();
  for (let i = 0; i < incomingZones.length; i++) {
    const iz = incomingZones[i];
    if (!iz || typeof iz !== 'object') return true;

    // Strict lookup: match strictly by ID or Name. Positional index fallback is unsafe and forbidden.
    const ez = (iz.id && existingIdMap.get(iz.id)) || (iz.name && existingNameMap.get(iz.name));
    if (!ez) return true;

    const ezKey = ez.id || ez.name;
    if (matchedExistingKeys.has(ezKey)) return true;
    matchedExistingKeys.add(ezKey);

    const izLayout = iz.layout || (Array.isArray(iz.seats) && iz.seats.length > 0 ? 'custom' : 'matrix');
    const ezLayout = ez.layout || (Array.isArray(ez.seats) && ez.seats.length > 0 ? 'custom' : 'matrix');
    if (izLayout !== ezLayout) return true;

    const izRows = iz.rows !== undefined ? Number(iz.rows) : Number(ez.rows || 4);
    const ezRows = ez.rows !== undefined ? Number(ez.rows) : 4;
    if (izRows !== ezRows) return true;

    const izCols = iz.cols !== undefined ? Number(iz.cols) : Number(ez.cols || 8);
    const ezCols = ez.cols !== undefined ? Number(ez.cols) : 8;
    if (izCols !== ezCols) return true;

    const izOriginX = Number(iz.originX || 0);
    const ezOriginX = Number(ez.originX || 0);
    if (Math.abs(izOriginX - ezOriginX) > 0.001) return true;

    const izOriginY = Number(iz.originY || 0);
    const ezOriginY = Number(ez.originY || 0);
    if (Math.abs(izOriginY - ezOriginY) > 0.001) return true;

    const izSeats = Array.isArray(iz.seats) ? iz.seats : [];
    const ezSeats = Array.isArray(ez.seats) ? ez.seats : [];

    if (izSeats.length !== ezSeats.length) return true;

    if (izSeats.length > 0) {
      const ezSeatMap = new Map();
      for (const s of ezSeats) {
        if (s && typeof s === 'object') {
          ezSeatMap.set(String(s.label || s.seatNumber).trim(), s);
        }
      }
      for (const s of izSeats) {
        if (!s || typeof s !== 'object') return true;
        const label = String(s.label || s.seatNumber).trim();
        const matched = ezSeatMap.get(label);
        if (!matched) return true;
        if (Math.abs(Number(s.x || 0) - Number(matched.x || 0)) > 0.001) return true;
        if (Math.abs(Number(s.y || 0) - Number(matched.y || 0)) > 0.001) return true;
      }
    }
  }

  if (matchedExistingKeys.size !== existingZones.length) return true;

  return false;
}

function notifyEventChanges(existing, updated, updates) {
  const dateOrVenueChanged =
    (updates.venue && updates.venue !== existing.venue) ||
    (updates.showTime && updates.showTime !== existing.showTime) ||
    (updates.rounds && JSON.stringify(updates.rounds) !== JSON.stringify(existing.rounds));

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
}

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

    let totalSeats = 0;
    let totalAvailableSeats = 0;
    let totalBookedSeats = 0;
    let totalHeldSeats = 0;

    for (const r of roundAvailability) {
      for (const z of (r.zones || [])) {
        totalSeats += (z.totalSeats || 0);
        totalAvailableSeats += (z.availableSeats || 0);
        totalBookedSeats += (z.bookedSeats || 0);
        totalHeldSeats += (z.heldSeats || 0);
      }
    }

    return {
      ...e,
      isBookmarked: userBookmarks.includes(e.id),
      totalSeats,
      totalAvailableSeats,
      totalBookedSeats,
      totalHeldSeats,
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
 * F-04: Seat Templates Catalog Presets API
 * GET /api/events/templates
 */
function getTemplates(_req, res) {
  const templates = getAllTemplates();
  return res.json({ templates });
}

/**
 * FR-13, FR-48: Create Event (Admin)
 * POST /api/events
 */
function createEvent(req, res) {
  clearDeleteFailedAttempts(req.user && req.user.id);

  const validation = validateEventPayload(req.body, { isUpdate: false });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const payload = { ...req.body };
  if (payload.category) {
    const c = payload.category.trim().toLowerCase();
    payload.category = c === 'seminar' ? 'Seminar' : 'Concert';
  }

  const newEvent = EventModel.create(payload);
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

  const validation = validateEventPayload(req.body, { isUpdate: true });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const updates = { ...req.body };
  delete updates.id;

  if (updates.category) {
    const c = updates.category.trim().toLowerCase();
    updates.category = c === 'seminar' ? 'Seminar' : 'Concert';
  }

  const hasZones = Array.isArray(updates.zones);
  const layoutModified = isLayoutModified(existing, updates);

  if (layoutModified) {
    if (SeatModel.hasNonAvailableSeats(existing.id)) {
      return res.status(409).json({
        error: 'Cannot modify seating layout while active bookings or seat holds exist.',
        code: 'LAYOUT_LOCKED'
      });
    }

    const updated = EventModel.update(existing.id, updates);
    SeatModel.regenerateForEvent(updated, updates.zones);

    notifyEventChanges(existing, updated, updates);

    return res.json({
      message: 'Event updated successfully',
      event: updated
    });
  }

  const updated = EventModel.update(existing.id, updates);

  if (hasZones) {
    SeatModel.propagateZoneUpdates(existing.id, updates.zones);
  }

  notifyEventChanges(existing, updated, updates);

  return res.json({
    message: 'Event updated successfully',
    event: updated
  });
}

/**
 * FR-15, F-08, F-09, F-10: Password-Verified Delete Event with Rate Throttle and Auto-Refund (Admin)
 * DELETE /api/events/:id
 */
async function deleteEvent(req, res) {
  const event = EventModel.findById(req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const { password } = req.body || {};
  if (!password || typeof password !== 'string' || password.trim().length === 0) {
    return res.status(400).json({
      error: 'Administrator password is required.'
    });
  }

  const adminId = req.user.id;
  if (isDeleteRateThrottled(adminId)) {
    return res.status(429).json({
      error: 'Too many failed verification attempts. Please try again later.'
    });
  }

  const adminUser = UserModel.findById(adminId);
  if (!adminUser || !adminUser.passwordHash) {
    return res.status(401).json({ error: 'Administrator credentials not found.' });
  }

  const isMatch = await bcrypt.compare(password, adminUser.passwordHash);
  if (!isMatch) {
    recordDeleteFailedAttempt(adminId);
    return res.status(403).json({
      error: 'Invalid administrator password.',
      code: 'INVALID_PASSWORD'
    });
  }

  clearDeleteFailedAttempts(adminId);

  // Auto-cancel and refund all bookings for this event (F-10)
  const bookings = BookingModel.findByEventId(event.id);
  let refundedBookingsCount = 0;

  for (const b of bookings) {
    if (b.status === 'PAID') {
      cancelAndRefundBooking(b, { reason: 'EVENT_CANCELLED' });
      refundedBookingsCount++;
    } else if (b.status === 'PENDING') {
      cancelAndRefundBooking(b, { reason: 'EVENT_CANCELLED' });
    }
  }

  SeatModel.removeByEvent(event.id);
  EventModel.remove(event.id);

  return res.json({
    message: 'Event and seat records deleted successfully.',
    refundedBookingsCount
  });
}

module.exports = {
  listEvents,
  getEventById,
  toggleBookmark,
  getTemplates,
  validateEventPayload,
  isLayoutModified,
  createEvent,
  updateEvent,
  deleteEvent,
  clearDeleteFailedAttempts
};
