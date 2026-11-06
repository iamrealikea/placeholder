/**
 * TicketHub - Seat Templates Catalog (src/store/seatTemplates.js)
 * Predefined venue seating templates for Concert Arena, Theater/Hall, and Seminar Classroom.
 * Implements F-01 (Milestone 1).
 */

const SEAT_DIAMETER = 36;
const GRID_PITCH = 44;

function getCenteredStartX(canvasWidth, cols, options = {}) {
  const { dx = GRID_PITCH, aisleCol = null, aisleWidth = GRID_PITCH } = options;
  const totalWidth = (cols - 1) * dx + SEAT_DIAMETER + (aisleCol ? aisleWidth : 0);
  return Math.round((canvasWidth - totalWidth) / 2);
}

function generateZoneSeats(rowLetters, cols, startX, startY, options = {}) {
  const { dx = GRID_PITCH, dy = GRID_PITCH, aisleCol = null, aisleWidth = GRID_PITCH } = options;
  const seats = [];
  for (let r = 0; r < rowLetters.length; r++) {
    const row = rowLetters[r];
    let currentX = startX;
    for (let c = 1; c <= cols; c++) {
      if (aisleCol && c === aisleCol + 1) {
        currentX += aisleWidth;
      }
      seats.push({
        label: `${row}${c}`,
        row,
        col: c,
        x: currentX,
        y: startY + r * dy
      });
      currentX += dx;
    }
  }
  return seats;
}

const TEMPLATES = {
  'concert-arena': {
    id: 'concert-arena',
    name: 'Concert Arena',
    category: 'Concert',
    description: 'Multi-tiered stadium arena with Floor VIP, Lower Bowl, and Upper Bowl seating.',
    defaultVenue: 'Impact Arena, Muang Thong Thani',
    canvasWidth: 900,
    canvasHeight: 700,
    zones: [
      {
        id: 'zone-floor',
        name: 'Floor VIP',
        color: '#FF0800',
        price: 5000,
        layout: 'template',
        rows: 4,
        cols: 10,
        originX: getCenteredStartX(900, 10),
        originY: 96,
        seats: generateZoneSeats(['A', 'B', 'C', 'D'], 10, getCenteredStartX(900, 10), 96)
      },
      {
        id: 'zone-lower',
        name: 'Lower Bowl',
        color: '#1D56CF',
        price: 3000,
        layout: 'template',
        rows: 4,
        cols: 14,
        originX: getCenteredStartX(900, 14),
        originY: 296,
        seats: generateZoneSeats(['E', 'F', 'G', 'H'], 14, getCenteredStartX(900, 14), 296)
      },
      {
        id: 'zone-upper',
        name: 'Upper Bowl',
        color: '#0D9488',
        price: 1500,
        layout: 'template',
        rows: 4,
        cols: 16,
        originX: getCenteredStartX(900, 16),
        originY: 496,
        seats: generateZoneSeats(['J', 'K', 'L', 'M'], 16, getCenteredStartX(900, 16), 496)
      }
    ]
  },
  'theater-hall': {
    id: 'theater-hall',
    name: 'Theater / Hall',
    category: 'Concert',
    description: 'Proscenium theater layout featuring split Orchestra stalls and elevated Balcony circle.',
    defaultVenue: 'Siam Paragon Royal Paragon Hall',
    canvasWidth: 850,
    canvasHeight: 600,
    zones: [
      {
        id: 'zone-orchestra',
        name: 'Orchestra',
        color: '#1D56CF',
        price: 3500,
        layout: 'template',
        rows: 5,
        cols: 10,
        originX: getCenteredStartX(850, 10, { aisleCol: 5, aisleWidth: 44 }),
        originY: 96,
        seats: generateZoneSeats(
          ['A', 'B', 'C', 'D', 'E'],
          10,
          getCenteredStartX(850, 10, { aisleCol: 5, aisleWidth: 44 }),
          96,
          { aisleCol: 5, aisleWidth: 44 }
        )
      },
      {
        id: 'zone-balcony',
        name: 'Balcony',
        color: '#F59E0B',
        price: 2000,
        layout: 'template',
        rows: 4,
        cols: 12,
        originX: getCenteredStartX(850, 12, { aisleCol: 6, aisleWidth: 44 }),
        originY: 360,
        seats: generateZoneSeats(
          ['F', 'G', 'H', 'J'],
          12,
          getCenteredStartX(850, 12, { aisleCol: 6, aisleWidth: 44 }),
          360,
          { aisleCol: 6, aisleWidth: 44 }
        )
      }
    ]
  },
  'seminar-classroom': {
    id: 'seminar-classroom',
    name: 'Seminar Classroom',
    category: 'Seminar',
    description: 'Tiered classroom configuration with Executive Front desks and General Delegate rows.',
    defaultVenue: 'Queen Sirikit National Convention Center (QSNCC)',
    canvasWidth: 800,
    canvasHeight: 550,
    zones: [
      {
        id: 'zone-exec',
        name: 'Executive Front Row',
        color: '#FF0800',
        price: 2500,
        layout: 'template',
        rows: 2,
        cols: 8,
        originX: getCenteredStartX(800, 8, { aisleCol: 4, aisleWidth: 44 }),
        originY: 96,
        seats: generateZoneSeats(
          ['A', 'B'],
          8,
          getCenteredStartX(800, 8, { aisleCol: 4, aisleWidth: 44 }),
          96,
          { aisleCol: 4, aisleWidth: 44 }
        )
      },
      {
        id: 'zone-delegate',
        name: 'General Delegate',
        color: '#1D56CF',
        price: 1200,
        layout: 'template',
        rows: 4,
        cols: 10,
        originX: getCenteredStartX(800, 10, { aisleCol: 5, aisleWidth: 44 }),
        originY: 228,
        seats: generateZoneSeats(
          ['C', 'D', 'E', 'F'],
          10,
          getCenteredStartX(800, 10, { aisleCol: 5, aisleWidth: 44 }),
          228,
          { aisleCol: 5, aisleWidth: 44 }
        )
      }
    ]
  }
};

function getTemplate(key) {
  if (!key) return null;
  const normalizedKey = String(key).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(TEMPLATES, normalizedKey)) {
    return null;
  }
  const template = TEMPLATES[normalizedKey];
  if (!template) return null;
  return JSON.parse(JSON.stringify(template));
}

function getAllTemplates() {
  return Object.values(TEMPLATES).map((t) => JSON.parse(JSON.stringify(t)));
}

module.exports = {
  TEMPLATES,
  getTemplate,
  getAllTemplates
};
