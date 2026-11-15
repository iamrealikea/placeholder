const { store } = require('../store/jsonStore');
const { buildSeatsForEvent } = require('../store/seed');

class SeatModel {
  static expireHeldSeats() {
    return store.expireHeldSeats();
  }

  static findAll() {
    return store.getAll('seats');
  }

  static findByEvent(eventId) {
    return store.find('seats', (s) => s.eventId === eventId);
  }

  static findByEventAndRound(eventId, roundId) {
    return store.find(
      'seats',
      (s) => s.eventId === eventId && (!roundId || s.roundId === roundId)
    );
  }

  static findByIds(seatIds) {
    return store.find('seats', (s) => seatIds.includes(s.id));
  }

  static getZoneSeatAvailability(eventId, roundId) {
    this.expireHeldSeats();
    const seats = this.findByEventAndRound(eventId, roundId);

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
   * Generates all seats for an event and inserts them into the store.
   * Ensures x, y, and seatColor attributes are consistently defined.
   */
  static generateForEvent(event) {
    const seats = buildSeatsForEvent(event);
    for (const s of seats) {
      if (!s || typeof s !== 'object') continue;
      s.x = s.x !== undefined ? s.x : null;
      s.y = s.y !== undefined ? s.y : null;
      s.seatColor = s.seatColor !== undefined ? s.seatColor : null;
    }
    store.insertMany('seats', seats);
    return seats;
  }

  /**
   * Regenerates seats for an event when layout is modified.
   * Removes existing AVAILABLE seats and inserts new seats.
   */
  static regenerateForEvent(event, updatedZones) {
    this.expireHeldSeats();
    store.removeWhere('seats', (s) => s && s.eventId === event.id && s.status === 'AVAILABLE');
    const tempEvt = { ...event, zones: updatedZones || event.zones };
    const newSeats = buildSeatsForEvent(tempEvt);

    const seatsToInsert = [];
    for (const ns of newSeats) {
      if (!ns || typeof ns !== 'object') continue;
      const existing = store.findOne('seats', (s) => s && s.id === ns.id);
      if (!existing) {
        ns.x = ns.x !== undefined ? ns.x : null;
        ns.y = ns.y !== undefined ? ns.y : null;
        ns.seatColor = ns.seatColor !== undefined ? ns.seatColor : null;
        seatsToInsert.push(ns);
      }
    }
    if (seatsToInsert.length > 0) {
      store.insertMany('seats', seatsToInsert);
    }
    return seatsToInsert;
  }

  /**
   * Propagates zone price, color, and name updates strictly to AVAILABLE seats.
   * HELD and BOOKED seats remain completely unchanged (F-07).
   */
  static propagateZoneUpdates(eventId, updatedZones) {
    this.expireHeldSeats();
    const seats = store.find('seats', (s) => s && s.eventId === eventId);
    if (!seats.length || !Array.isArray(updatedZones) || updatedZones.length === 0) {
      return { updatedCount: 0 };
    }

    const zoneMap = new Map();
    for (const z of updatedZones) {
      if (!z || typeof z !== 'object') continue;
      if (z.id) zoneMap.set(z.id, z);
      if (z.name) zoneMap.set(z.name, z);
    }

    let updatedCount = 0;
    for (const s of seats) {
      if (!s || typeof s !== 'object') continue;
      if (s.status === 'AVAILABLE') {
        const zone = zoneMap.get(s.zoneId) || zoneMap.get(s.zoneName);
        if (zone) {
          if (zone.price !== undefined) {
            const num = Number(zone.price);
            if (!isNaN(num)) {
              s.price = Math.max(0, num);
            }
          }
          if (zone.color !== undefined) {
            s.zoneColor = zone.color;
          }
          if (zone.name !== undefined) {
            s.zoneName = zone.name;
          }
          if (Array.isArray(zone.seats) && zone.seats.length > 0) {
            const seatDef = zone.seats.find(
              (zs) => zs && typeof zs === 'object' && (zs.label || zs.seatNumber) === s.seatNumber
            );
            if (seatDef) {
              if (seatDef.color !== undefined) {
                s.seatColor = seatDef.color || null;
              }
              if (seatDef.price !== undefined) {
                const sp = Number(seatDef.price);
                if (!isNaN(sp)) {
                  s.price = Math.max(0, sp);
                }
              }
            }
          }
          updatedCount++;
        }
      }
    }

    if (updatedCount > 0) {
      store.save('seats');
    }

    return { updatedCount };
  }

  /**
   * Checks whether an event (or specific round) has any non-AVAILABLE (HELD or BOOKED) seats.
   * Used for layout lock verification (F-06).
   */
  static hasNonAvailableSeats(eventId, roundId = null) {
    this.expireHeldSeats();
    const seats = roundId
      ? this.findByEventAndRound(eventId, roundId)
      : this.findByEvent(eventId);
    return seats.some((s) => s.status !== 'AVAILABLE');
  }

  /**
   * Checks whether an event (or specific round) has any BOOKED seats.
   */
  static hasBookedSeats(eventId, roundId = null) {
    const seats = roundId
      ? this.findByEventAndRound(eventId, roundId)
      : this.findByEvent(eventId);
    return seats.some((s) => s.status === 'BOOKED');
  }

  /**
   * Returns total, available, held, and booked seat counts for an event.
   */
  static getEventSeatSummary(eventId) {
    this.expireHeldSeats();
    const seats = this.findByEvent(eventId);
    const summary = {
      total: 0,
      available: 0,
      held: 0,
      booked: 0
    };
    for (const s of seats) {
      if (!s || typeof s !== 'object') continue;
      summary.total++;
      if (s.status === 'AVAILABLE') summary.available++;
      else if (s.status === 'HELD') summary.held++;
      else if (s.status === 'BOOKED') summary.booked++;
    }
    return summary;
  }

  static holdSeats(targetSeats, userId, bookingId, holdExpiresAt) {
    for (const s of targetSeats) {
      s.status = 'HELD';
      s.heldByUserId = userId;
      s.holdExpiresAt = holdExpiresAt;
      s.bookingId = bookingId;
    }
    store.save('seats');
    return targetSeats;
  }

  static markBooked(seatIds) {
    const seats = this.findByIds(seatIds);
    for (const s of seats) {
      s.status = 'BOOKED';
      s.holdExpiresAt = null;
    }
    store.save('seats');
    return seats;
  }

  static releaseSeats(seatIds) {
    const seats = this.findByIds(seatIds);
    for (const s of seats) {
      s.status = 'AVAILABLE';
      s.heldByUserId = null;
      s.holdExpiresAt = null;
      s.bookingId = null;
    }
    store.save('seats');
    return seats;
  }

  static removeByEvent(eventId) {
    return store.removeWhere('seats', (s) => s.eventId === eventId);
  }
}

module.exports = SeatModel;
