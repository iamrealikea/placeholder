const { v4: uuidv4 } = require('uuid');
const { store } = require('../store/jsonStore');

class EventModel {
  static findAll(filters = {}) {
    const { search, category, status, date, artist, featured, saleActive } = filters;
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

    if (saleActive === 'true') {
      const now = new Date();
      list = list.filter((e) => this.isSaleOpen(e, now));
    }

    return list;
  }

  static findById(id) {
    return store.findById('events', id);
  }

  static isSaleOpen(event, now = new Date()) {
    if (!event) return false;
    const saleStart = new Date(event.saleStartAt);
    const saleEnd = new Date(event.saleEndAt);
    return now >= saleStart && now <= saleEnd && event.status === 'On Sale';
  }

  /**
   * Helper to normalize a zone object and preserve layout, originX, originY, and seats
   * while merging with existing zone data if present.
   */
  static normalizeZone(z, idx = 0, existingZone = null) {
    const zoneObj = (z && typeof z === 'object') ? z : {};

    let seats = [];
    if (Array.isArray(zoneObj.seats)) {
      seats = zoneObj.seats
        .filter((s) => s && typeof s === 'object')
        .map((s) => {
          const item = {
            label: String(s.label || s.seatNumber || '').trim(),
            x: Number(s.x !== undefined && s.x !== null && Number.isFinite(Number(s.x)) ? s.x : 0),
            y: Number(s.y !== undefined && s.y !== null && Number.isFinite(Number(s.y)) ? s.y : 0)
          };
          const color = s.color || s.seatColor;
          if (color) {
            item.color = String(color);
          }
          if (s.price !== undefined && s.price !== null && Number.isFinite(Number(s.price))) {
            item.price = Math.max(0, Number(s.price));
          }
          return item;
        });
    } else if (existingZone && Array.isArray(existingZone.seats)) {
      seats = existingZone.seats
        .filter((s) => s && typeof s === 'object')
        .map((s) => ({ ...s }));
    }

    const layout =
      zoneObj.layout ||
      (existingZone && existingZone.layout) ||
      (seats.length > 0 ? 'custom' : 'matrix');

    const rows =
      zoneObj.rows !== undefined && Number.isFinite(Number(zoneObj.rows))
        ? Math.max(1, Math.floor(Number(zoneObj.rows)))
        : existingZone && existingZone.rows !== undefined && Number.isFinite(Number(existingZone.rows))
        ? Math.max(1, Math.floor(Number(existingZone.rows)))
        : 4;

    const cols =
      zoneObj.cols !== undefined && Number.isFinite(Number(zoneObj.cols))
        ? Math.max(1, Math.floor(Number(zoneObj.cols)))
        : existingZone && existingZone.cols !== undefined && Number.isFinite(Number(existingZone.cols))
        ? Math.max(1, Math.floor(Number(existingZone.cols)))
        : 8;

    const originX =
      zoneObj.originX !== undefined && zoneObj.originX !== null && Number.isFinite(Number(zoneObj.originX))
        ? Number(zoneObj.originX)
        : existingZone && existingZone.originX !== undefined && existingZone.originX !== null && Number.isFinite(Number(existingZone.originX))
        ? Number(existingZone.originX)
        : 0;

    const originY =
      zoneObj.originY !== undefined && zoneObj.originY !== null && Number.isFinite(Number(zoneObj.originY))
        ? Number(zoneObj.originY)
        : existingZone && existingZone.originY !== undefined && existingZone.originY !== null && Number.isFinite(Number(existingZone.originY))
        ? Number(existingZone.originY)
        : 0;

    const existingPrice =
      existingZone && existingZone.price !== undefined && existingZone.price !== null && Number.isFinite(Number(existingZone.price))
        ? Math.max(0, Number(existingZone.price))
        : 0;

    const price =
      zoneObj.price !== undefined && zoneObj.price !== null && String(zoneObj.price).trim() !== '' && Number.isFinite(Number(zoneObj.price))
        ? Math.max(0, Number(zoneObj.price))
        : existingPrice;

    return {
      id: zoneObj.id || (existingZone && existingZone.id) || `zone-${idx + 1}`,
      name: String(zoneObj.name || (existingZone && existingZone.name) || `Zone ${idx + 1}`).trim(),
      color: zoneObj.color || (existingZone && existingZone.color) || '#1D56CF',
      price,
      layout,
      rows,
      cols,
      originX,
      originY,
      seats
    };
  }

  static create(payload) {
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
      rounds = [],
      zones = [],
      isFeatured
    } = payload;

    const newEvent = {
      id: `evt-${uuidv4().slice(0, 8)}`,
      title: String(title).trim(),
      artist: String(artist || '').trim(),
      category: category || 'Concert',
      status: status || 'On Sale',
      isFeatured: Boolean(isFeatured),
      posterUrl:
        posterUrl ||
        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
      galleryUrl:
        galleryUrl ||
        'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=900&q=80',
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
      rounds: (rounds || []).map((r, idx) => ({
        id: r.id || `rnd-${idx + 1}`,
        date: r.date,
        time: r.time,
        label: r.label || `${r.date} • ${r.time}`
      })),
      zones: (zones || []).map((z, idx) => EventModel.normalizeZone(z, idx)),
      createdAt: new Date().toISOString()
    };

    return store.insert('events', newEvent);
  }

  static update(id, updates) {
    const existing = store.findById('events', id);
    const cleanUpdates = { ...updates };
    delete cleanUpdates.id;

    if (cleanUpdates.zones && Array.isArray(cleanUpdates.zones)) {
      cleanUpdates.zones = cleanUpdates.zones
        .filter((z) => z && typeof z === 'object')
        .map((z, idx) => {
          const existingZone =
            existing && Array.isArray(existing.zones)
              ? existing.zones.find(
                  (ez) => ez && typeof ez === 'object' && ((z.id && ez.id === z.id) || (z.name && ez.name === z.name))
                )
              : null;
          return EventModel.normalizeZone(z, idx, existingZone);
        });
    }

    if (cleanUpdates.rounds && Array.isArray(cleanUpdates.rounds)) {
      cleanUpdates.rounds = cleanUpdates.rounds
        .filter((r) => r && typeof r === 'object')
        .map((r, idx) => ({
          id: r.id || `rnd-${idx + 1}`,
          date: r.date,
          time: r.time,
          label: r.label || `${r.date} • ${r.time}`
        }));
    }

    return store.update('events', id, cleanUpdates);
  }

  static remove(id) {
    return store.remove('events', id);
  }
}

module.exports = EventModel;
