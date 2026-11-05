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

  static generateForEvent(event) {
    const seats = buildSeatsForEvent(event);
    store.insertMany('seats', seats);
    return seats;
  }

  static regenerateForEvent(event, updatedZones) {
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
    return seatsToInsert;
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
