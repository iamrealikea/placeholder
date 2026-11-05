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
      rounds,
      zones,
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

    return store.insert('events', newEvent);
  }

  static update(id, updates) {
    const cleanUpdates = { ...updates };
    delete cleanUpdates.id;
    return store.update('events', id, cleanUpdates);
  }

  static remove(id) {
    return store.remove('events', id);
  }
}

module.exports = EventModel;
