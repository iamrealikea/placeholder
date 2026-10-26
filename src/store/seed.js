const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');

function buildSeatsForEvent(event) {
  const seats = [];
  for (const round of event.rounds) {
    for (const zone of event.zones) {
      const rowLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, zone.rows || 4).split('');
      const cols = zone.cols || 8;
      for (let r = 0; r < rowLetters.length; r++) {
        for (let c = 1; c <= cols; c++) {
          const seatNumber = `${rowLetters[r]}${c}`;
          const id = `seat-${event.id}-${round.id}-${zone.id}-${seatNumber}`;
          let status = 'AVAILABLE';
          let bookingId = null;

          if (event.status === 'Sold Out') {
            status = 'BOOKED';
          } else if (
            event.id === 'evt-1' &&
            round.id === 'rnd-1a' &&
            zone.id === 'zone-vip' &&
            (seatNumber === 'A1' || seatNumber === 'A2')
          ) {
            status = 'BOOKED';
            bookingId = 'bkg-demo-1';
          } else if (
            event.id === 'evt-1' &&
            round.id === 'rnd-1a' &&
            (seatNumber === 'B3' || seatNumber === 'B4' || seatNumber === 'C5')
          ) {
            status = 'BOOKED';
          }

          seats.push({
            id,
            eventId: event.id,
            roundId: round.id,
            zoneId: zone.id,
            zoneName: zone.name,
            zoneColor: zone.color,
            row: rowLetters[r],
            col: c,
            seatNumber,
            price: zone.price,
            status,
            heldByUserId: null,
            holdExpiresAt: null,
            bookingId
          });
        }
      }
    }
  }
  return seats;
}

function generateSeedData() {
  const passwordHashUser = bcrypt.hashSync('password123', 8);
  const passwordHashAdmin = bcrypt.hashSync('admin123', 8);
  const passwordHashStaff = bcrypt.hashSync('staff123', 8);

  const users = [
    {
      id: 'usr-customer-1',
      name: 'Chanita Chansamrong',
      email: 'user@ticket.com',
      phone: '0812345678',
      age: 21,
      dob: '2005-04-15',
      gender: 'Female',
      nationalId: '1100501234567',
      address: '99 Phahonyothin Rd, Chatuchak, Bangkok 10900',
      avatarUrl: '',
      passwordHash: passwordHashUser,
      authProvider: 'local',
      role: 'customer',
      points: 650,
      bookmarks: ['evt-1', 'evt-4'],
      createdAt: '2026-09-01T10:00:00.000Z'
    },
    {
      id: 'usr-admin-1',
      name: 'Sirawit Admin',
      email: 'admin@ticket.com',
      phone: '0899999999',
      age: 22,
      dob: '2004-08-20',
      gender: 'Male',
      nationalId: '1100509876543',
      address: 'TicketHub HQ, Pathum Wan, Bangkok 10330',
      avatarUrl: '',
      passwordHash: passwordHashAdmin,
      authProvider: 'local',
      role: 'admin',
      points: 1000,
      bookmarks: [],
      createdAt: '2026-08-15T09:00:00.000Z'
    },
    {
      id: 'usr-staff-1',
      name: 'Supakit Gate Scanner',
      email: 'staff@ticket.com',
      phone: '0822223333',
      age: 22,
      dob: '2004-11-10',
      gender: 'Male',
      nationalId: '1100505554443',
      address: 'Impact Arena Gate 2, Nonthaburi 11120',
      avatarUrl: '',
      passwordHash: passwordHashStaff,
      authProvider: 'local',
      role: 'staff',
      points: 0,
      bookmarks: [],
      createdAt: '2026-08-20T09:00:00.000Z'
    }
  ];

  const events = [
    {
      id: 'evt-1',
      title: 'Forza Horizon Somethings Live Festival',
      artist: 'Horizon Symphony & DJ Pulse',
      category: 'Concert',
      status: 'On Sale',
      isFeatured: true,
      posterUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
      galleryUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=900&q=80',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam vel volutpat lectus. Phasellus eleifend feugiat orci, eget accumsan quam scelerisque eu. Sed sapien sem, rhoncus non consectetur nec, fringilla id metus. Experience the ultimate Tokyo-inspired festival stage with full surround laser production and live electronic sets.',
      venue: 'Impact Arena, Muang Thong Thani',
      organizer: 'kys show',
      gateOpenTime: '16:00',
      showTime: '19:00',
      saleStartAt: '2026-01-01T00:00:00.000Z',
      saleEndAt: '2027-12-31T23:59:59.000Z',
      maxTicketsPerUser: 6,
      allowCancellation: true,
      refundPolicyPct: 100,
      rounds: [
        { id: 'rnd-1a', date: '2026-11-11', time: '19:00', label: '11 Nov 2026 • 19:00' },
        { id: 'rnd-1b', date: '2026-11-12', time: '19:00', label: '12 Nov 2026 • 19:00' }
      ],
      zones: [
        { id: 'zone-vip', name: 'VIP Stage Front', color: '#FF0800', price: 4500, rows: 4, cols: 8 },
        { id: 'zone-a', name: 'Zone A (Monday Blue)', color: '#1D56CF', price: 2800, rows: 4, cols: 8 },
        { id: 'zone-b', name: 'Zone B (Standard)', color: '#0D9488', price: 1500, rows: 4, cols: 8 }
      ],
      createdAt: '2026-09-01T00:00:00.000Z'
    },
    {
      id: 'evt-2',
      title: 'Event #2 : fih Acoustic & Bass Arena Tour',
      artist: 'fih Ensemble',
      category: 'Concert',
      status: 'On Sale',
      isFeatured: true,
      posterUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1000&q=80',
      galleryUrl: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=900&q=80',
      description:
        'An intimate yet high-energy live concert experience featuring the viral fih tour production. Select your preferred zone and seat directly on our interactive seating chart.',
      venue: 'Thunder Dome, Nonthaburi',
      organizer: 'TicketHub Live',
      gateOpenTime: '17:00',
      showTime: '19:30',
      saleStartAt: '2026-01-01T00:00:00.000Z',
      saleEndAt: '2027-12-31T23:59:59.000Z',
      maxTicketsPerUser: 4,
      allowCancellation: true,
      refundPolicyPct: 100,
      rounds: [
        { id: 'rnd-2a', date: '2026-11-11', time: '19:30', label: '11 Nov 2026 • 19:30' },
        { id: 'rnd-2b', date: '2026-11-15', time: '18:00', label: '15 Nov 2026 • 18:00' }
      ],
      zones: [
        { id: 'zone-2-vip', name: 'VIP Ring', color: '#FF0800', price: 3500, rows: 3, cols: 8 },
        { id: 'zone-2-std', name: 'Standard Hall', color: '#1D56CF', price: 1800, rows: 4, cols: 8 }
      ],
      createdAt: '2026-09-05T00:00:00.000Z'
    },
    {
      id: 'evt-3',
      title: 'Global AI & Cloud Architecture Seminar 2026',
      artist: 'Dr. Arisa & DeepTech Speakers',
      category: 'Seminar',
      status: 'On Sale',
      isFeatured: true,
      posterUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1000&q=80',
      galleryUrl: 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?auto=format&fit=crop&w=900&q=80',
      description:
        'Full-day technology seminar covering scalable ticketing systems, high-concurrency seat locking, cloud architecture, and AI engineering workshops.',
      venue: 'Queen Sirikit National Convention Center (QSNCC)',
      organizer: 'Thai Tech Guild',
      gateOpenTime: '08:30',
      showTime: '09:30',
      saleStartAt: '2026-01-01T00:00:00.000Z',
      saleEndAt: '2027-12-31T23:59:59.000Z',
      maxTicketsPerUser: 6,
      allowCancellation: true,
      refundPolicyPct: 100,
      rounds: [
        { id: 'rnd-3a', date: '2026-11-20', time: '09:30', label: '20 Nov 2026 • 09:30' }
      ],
      zones: [
        { id: 'zone-3-exec', name: 'Executive Front Row', color: '#FF0800', price: 2500, rows: 3, cols: 6 },
        { id: 'zone-3-gen', name: 'General Delegate', color: '#1D56CF', price: 1200, rows: 4, cols: 8 }
      ],
      createdAt: '2026-09-10T00:00:00.000Z'
    },
    {
      id: 'evt-4',
      title: 'Event #23 : Kawaii Mascot & Plushie Wonderland',
      artist: 'Blue Cat & Friends',
      category: 'Concert',
      status: 'Coming Soon',
      isFeatured: false,
      posterUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1000&q=80',
      galleryUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=80',
      description:
        'Upcoming winter showcase and fan-meet concert featuring special stage performances, limited plush collectibles, and interactive fan zones.',
      venue: 'Siam Paragon Royal Paragon Hall',
      organizer: 'Mascot Live Asia',
      gateOpenTime: '15:00',
      showTime: '17:00',
      saleStartAt: '2026-12-01T10:00:00.000Z',
      saleEndAt: '2026-12-20T23:59:59.000Z',
      maxTicketsPerUser: 4,
      allowCancellation: true,
      refundPolicyPct: 100,
      rounds: [
        { id: 'rnd-4a', date: '2026-12-21', time: '17:00', label: '21 Dec 2026 • 17:00' }
      ],
      zones: [
        { id: 'zone-4-vip', name: 'Fan Meet VIP', color: '#FF0800', price: 3200, rows: 3, cols: 8 },
        { id: 'zone-4-b', name: 'Zone B', color: '#1D56CF', price: 1600, rows: 4, cols: 8 }
      ],
      createdAt: '2026-09-15T00:00:00.000Z'
    },
    {
      id: 'evt-5',
      title: 'Design Systems & Product Leadership Seminar',
      artist: 'UX Collective Southeast Asia',
      category: 'Seminar',
      status: 'Coming Soon',
      isFeatured: false,
      posterUrl: 'https://images.unsplash.com/photo-1559223607-a43c990c692c?auto=format&fit=crop&w=1000&q=80',
      galleryUrl: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80',
      description:
        'Deep dive into Figma design tokens, accessible ticketing interfaces, and agile product management for modern engineering teams.',
      venue: 'True Digital Park Grand Hall',
      organizer: 'Designers TH',
      gateOpenTime: '12:30',
      showTime: '13:30',
      saleStartAt: '2026-12-05T10:00:00.000Z',
      saleEndAt: '2026-12-21T23:59:59.000Z',
      maxTicketsPerUser: 4,
      allowCancellation: true,
      refundPolicyPct: 100,
      rounds: [
        { id: 'rnd-5a', date: '2026-12-21', time: '13:30', label: '21 Dec 2026 • 13:30' }
      ],
      zones: [
        { id: 'zone-5-a', name: 'Workshop Pass', color: '#1D56CF', price: 1900, rows: 3, cols: 8 }
      ],
      createdAt: '2026-09-18T00:00:00.000Z'
    },
    {
      id: 'evt-6',
      title: 'Midnight Symphony Stadium Finale',
      artist: 'Bangkok Philharmonic & Guests',
      category: 'Concert',
      status: 'Sold Out',
      isFeatured: false,
      posterUrl: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=1000&q=80',
      galleryUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=900&q=80',
      description:
        'All seats for the Midnight Symphony Stadium Finale have been sold out. Stay tuned for additional encore dates!',
      venue: 'Rajamangala National Stadium',
      organizer: 'Symphony Live',
      gateOpenTime: '16:00',
      showTime: '20:00',
      saleStartAt: '2026-08-01T00:00:00.000Z',
      saleEndAt: '2026-10-20T23:59:59.000Z',
      maxTicketsPerUser: 4,
      allowCancellation: false,
      refundPolicyPct: 0,
      rounds: [
        { id: 'rnd-6a', date: '2026-10-30', time: '20:00', label: '30 Oct 2026 • 20:00' }
      ],
      zones: [
        { id: 'zone-6-a', name: 'Arena Bowl', color: '#FF0800', price: 4000, rows: 3, cols: 6 }
      ],
      createdAt: '2026-08-01T00:00:00.000Z'
    }
  ];

  const seats = [];
  for (const evt of events) {
    seats.push(...buildSeatsForEvent(evt));
  }

  const bookings = [
    {
      id: 'bkg-demo-1',
      userId: 'usr-customer-1',
      eventId: 'evt-1',
      roundId: 'rnd-1a',
      seatIds: ['seat-evt-1-rnd-1a-zone-vip-A1', 'seat-evt-1-rnd-1a-zone-vip-A2'],
      seatNumbers: ['A1', 'A2'],
      zoneName: 'VIP Stage Front',
      subtotal: 9000,
      serviceFee: 80,
      discountAmount: 0,
      pointsUsed: 0,
      pointsEarned: 90,
      totalAmount: 9080,
      paymentMethod: 'PROMPTPAY',
      status: 'PAID',
      holdExpiresAt: null,
      createdAt: '2026-10-15T14:20:00.000Z'
    },
    {
      id: 'bkg-hist-1',
      userId: 'usr-customer-1',
      eventId: 'evt-2',
      roundId: 'rnd-2a',
      seatIds: [],
      seatNumbers: ['B1', 'B2'],
      zoneName: 'VIP Ring',
      subtotal: 7000,
      serviceFee: 80,
      discountAmount: 0,
      pointsUsed: 0,
      pointsEarned: 70,
      totalAmount: 7080,
      paymentMethod: 'CREDIT_CARD',
      status: 'PAID',
      holdExpiresAt: null,
      createdAt: '2026-07-12T11:00:00.000Z'
    },
    {
      id: 'bkg-hist-2',
      userId: 'usr-customer-1',
      eventId: 'evt-3',
      roundId: 'rnd-3a',
      seatIds: [],
      seatNumbers: ['A3'],
      zoneName: 'Executive Front Row',
      subtotal: 2500,
      serviceFee: 40,
      discountAmount: 0,
      pointsUsed: 0,
      pointsEarned: 25,
      totalAmount: 2540,
      paymentMethod: 'KBANK',
      status: 'PAID',
      holdExpiresAt: null,
      createdAt: '2026-08-19T16:30:00.000Z'
    },
    {
      id: 'bkg-hist-3',
      userId: 'usr-customer-1',
      eventId: 'evt-1',
      roundId: 'rnd-1b',
      seatIds: [],
      seatNumbers: ['C1', 'C2'],
      zoneName: 'Zone A (Monday Blue)',
      subtotal: 5600,
      serviceFee: 80,
      discountAmount: 0,
      pointsUsed: 0,
      pointsEarned: 56,
      totalAmount: 5680,
      paymentMethod: 'TRUEMONEY',
      status: 'PAID',
      holdExpiresAt: null,
      createdAt: '2026-09-22T18:15:00.000Z'
    }
  ];

  const payments = [
    {
      id: 'pay-demo-1',
      bookingId: 'bkg-demo-1',
      userId: 'usr-customer-1',
      method: 'PROMPTPAY',
      amount: 9080,
      referenceCode: 'TH-PP-20261015-001',
      status: 'SUCCESS',
      refundAmount: 0,
      paidAt: '2026-10-15T14:21:00.000Z',
      refundedAt: null
    },
    {
      id: 'pay-hist-1',
      bookingId: 'bkg-hist-1',
      userId: 'usr-customer-1',
      method: 'CREDIT_CARD',
      amount: 7080,
      referenceCode: 'TH-CC-20260712-002',
      status: 'SUCCESS',
      refundAmount: 0,
      paidAt: '2026-07-12T11:01:00.000Z',
      refundedAt: null
    },
    {
      id: 'pay-hist-2',
      bookingId: 'bkg-hist-2',
      userId: 'usr-customer-1',
      method: 'KBANK',
      amount: 2540,
      referenceCode: 'TH-KB-20260819-003',
      status: 'SUCCESS',
      refundAmount: 0,
      paidAt: '2026-08-19T16:31:00.000Z',
      refundedAt: null
    },
    {
      id: 'pay-hist-3',
      bookingId: 'bkg-hist-3',
      userId: 'usr-customer-1',
      method: 'TRUEMONEY',
      amount: 5680,
      referenceCode: 'TH-TM-20260922-004',
      status: 'SUCCESS',
      refundAmount: 0,
      paidAt: '2026-09-22T18:16:00.000Z',
      refundedAt: null
    }
  ];

  const tickets = [
    {
      id: 'tkt-demo-1',
      ticketCode: 'TKT-FH26-VIP-A1',
      bookingId: 'bkg-demo-1',
      userId: 'usr-customer-1',
      eventId: 'evt-1',
      eventTitle: 'Forza Horizon Somethings Live Festival',
      venue: 'Impact Arena, Muang Thong Thani',
      roundId: 'rnd-1a',
      roundLabel: '11 Nov 2026 • 19:00',
      seatId: 'seat-evt-1-rnd-1a-zone-vip-A1',
      seatNumber: 'A1',
      zoneName: 'VIP Stage Front',
      price: 4500,
      qrPayload: JSON.stringify({
        ticketCode: 'TKT-FH26-VIP-A1',
        eventId: 'evt-1',
        seatNumber: 'A1'
      }),
      qrDataUrl: '',
      status: 'VALID',
      checkedInAt: null,
      checkedInBy: null,
      createdAt: '2026-10-15T14:21:00.000Z'
    },
    {
      id: 'tkt-demo-2',
      ticketCode: 'TKT-FH26-VIP-A2',
      bookingId: 'bkg-demo-1',
      userId: 'usr-customer-1',
      eventId: 'evt-1',
      eventTitle: 'Forza Horizon Somethings Live Festival',
      venue: 'Impact Arena, Muang Thong Thani',
      roundId: 'rnd-1a',
      roundLabel: '11 Nov 2026 • 19:00',
      seatId: 'seat-evt-1-rnd-1a-zone-vip-A2',
      seatNumber: 'A2',
      zoneName: 'VIP Stage Front',
      price: 4500,
      qrPayload: JSON.stringify({
        ticketCode: 'TKT-FH26-VIP-A2',
        eventId: 'evt-1',
        seatNumber: 'A2'
      }),
      qrDataUrl: '',
      status: 'VALID',
      checkedInAt: null,
      checkedInBy: null,
      createdAt: '2026-10-15T14:21:00.000Z'
    }
  ];

  const promotions = [
    {
      id: 'promo-1',
      code: 'TICKETHUB10',
      description: '10% off ticket subtotal on any event',
      discountType: 'PERCENT',
      discountValue: 10,
      minSpend: 1000,
      active: true
    },
    {
      id: 'promo-2',
      code: 'WELCOME200',
      description: '200 THB instant discount (min spend 1,500 THB)',
      discountType: 'FIXED',
      discountValue: 200,
      minSpend: 1500,
      active: true
    }
  ];

  const notifications = [
    {
      id: 'ntf-1',
      userId: 'usr-customer-1',
      channel: 'BOTH',
      type: 'PAYMENT_SUCCESS',
      subject: 'Payment Confirmed: Forza Horizon Somethings Live Festival',
      message:
        'Your payment of 9,080 THB via PromptPay was successful. Tickets TKT-FH26-VIP-A1 and TKT-FH26-VIP-A2 are ready in My Tickets.',
      emailTo: 'user@ticket.com',
      isRead: false,
      createdAt: '2026-10-15T14:21:05.000Z'
    },
    {
      id: 'ntf-2',
      userId: 'usr-customer-1',
      channel: 'BOTH',
      type: 'BOOKMARK_ALERT',
      subject: 'Bookmarked Event Reminder: Kawaii Mascot & Plushie Wonderland',
      message:
        'An event in your Bookmarks (Event #23 : Kawaii Mascot & Plushie Wonderland) opens for sale on 1 Dec 2026 at 10:00.',
      emailTo: 'user@ticket.com',
      isRead: false,
      createdAt: '2026-10-20T09:00:00.000Z'
    }
  ];

  const support = [
    {
      id: 'sup-1',
      userId: 'usr-customer-1',
      name: 'Chanita Chansamrong',
      email: 'user@ticket.com',
      subject: 'Question about VIP gate entry time',
      category: 'Event Inquiry',
      message: 'Can VIP ticket holders enter 30 minutes before the standard 16:00 gate open time?',
      status: 'RESOLVED',
      adminReply: 'Yes! VIP Stage Front ticket holders can access the priority lane starting at 15:30 at Gate 1.',
      createdAt: '2026-10-16T10:30:00.000Z'
    }
  ];

  return {
    users,
    events,
    seats,
    bookings,
    payments,
    tickets,
    promotions,
    notifications,
    support
  };
}

async function ensureTicketQrCodes(store) {
  const tickets = store.getAll('tickets');
  let updated = false;
  for (const t of tickets) {
    if (!t.qrDataUrl) {
      t.qrDataUrl = await QRCode.toDataURL(t.qrPayload, {
        width: 280,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' }
      });
      updated = true;
    }
  }
  if (updated) {
    store.save('tickets');
  }
}

module.exports = {
  generateSeedData,
  buildSeatsForEvent,
  ensureTicketQrCodes
};
