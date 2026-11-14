const { v4: uuidv4 } = require('uuid');
const { store } = require('../store/jsonStore');

class EventModel {
  static findAll(filters = {}) {
    const { search, category, status, date, artist, featured, saleActive, province, location, month, sort } = filters;
    let list = store.getAll('events');

    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter(
        (e) =>
          (e.title && e.title.toLowerCase().includes(q)) ||
          (e.artist && e.artist.toLowerCase().includes(q)) ||
          (e.venue && e.venue.toLowerCase().includes(q)) ||
          (e.province && e.province.toLowerCase().includes(q))
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

    // Province filter: case-insensitive exact match on the province field
    if (province) {
      const p = String(province).trim().toLowerCase();
      list = list.filter((e) => e.province && e.province.trim().toLowerCase() === p);
    }

    // Location filter: case-insensitive partial match on province OR venue
    if (location) {
      const l = String(location).trim().toLowerCase();
      list = list.filter(
        (e) =>
          (e.province && e.province.toLowerCase().includes(l)) ||
          (e.venue && e.venue.toLowerCase().includes(l))
      );
    }

    // Month filter: "YYYY-MM" (specific year) or "MM" / "M" (any year); matches any round date
    if (month) {
      const m = String(month).trim();
      const full = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(m);
      const num = /^(0?[1-9]|1[0-2])$/.exec(m);
      list = list.filter((e) =>
        (e.rounds || []).some((r) => {
          if (!r || !r.date) return false;
          const [y, mo] = String(r.date).split('-');
          if (full) return y === full[1] && mo === full[2];
          if (num) return Number(mo) === Number(num[1]);
          return false;
        })
      );
    }

    if (featured === 'true') {
      list = list.filter((e) => e.isFeatured);
    }

    if (saleActive === 'true') {
      const now = new Date();
      list = list.filter((e) => this.isSaleOpen(e, now));
    }

    // Sort by lowest zone price. Events without any priced zone always go last.
    if (sort === 'price_asc' || sort === 'price_desc') {
      const dir = sort === 'price_asc' ? 1 : -1;
      list = list.slice().sort((a, b) => {
        const pa = this.getMinPrice(a);
        const pb = this.getMinPrice(b);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return (pa - pb) * dir;
      });
    }

    return list;
  }

  static get SORT_OPTIONS() {
    return ['price_asc', 'price_desc'];
  }

  /** Accepts "YYYY-MM" or "MM"/"M" (1-12). */
  static isValidMonth(value) {
    const m = String(value).trim();
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) || /^(0?[1-9]|1[0-2])$/.test(m);
  }

  /** Lowest zone price of an event, or null when no zone has a valid price. */
  static getMinPrice(event) {
    const prices = ((event && event.zones) || [])
      .map((z) => Number(z && z.price))
      .filter((n) => Number.isFinite(n));
    return prices.length ? Math.min(...prices) : null;
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
      province,
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
      province: String(province || '').trim(),
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