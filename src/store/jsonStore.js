const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const COLLECTIONS = [
  'users',
  'events',
  'seats',
  'bookings',
  'payments',
  'tickets',
  'promotions',
  'notifications',
  'support'
];

class JsonStore {
  constructor() {
    this.cache = {};
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }

  filePath(collection) {
    return path.join(DATA_DIR, `${collection}.json`);
  }

  init(seedGenerator) {
    this.ensureDirs();
    const usersPath = this.filePath('users');
    if (!fs.existsSync(usersPath)) {
      const initialData = seedGenerator();
      for (const col of COLLECTIONS) {
        this.cache[col] = initialData[col] || [];
        this.save(col);
      }
    } else {
      for (const col of COLLECTIONS) {
        this.load(col);
      }
    }
  }

  resetWithSeed(seedGenerator) {
    const initialData = seedGenerator();
    for (const col of COLLECTIONS) {
      this.cache[col] = initialData[col] || [];
      this.save(col);
    }
    return this.cache;
  }

  load(collection) {
    const fp = this.filePath(collection);
    if (!fs.existsSync(fp)) {
      this.cache[collection] = [];
      this.save(collection);
      return [];
    }
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      this.cache[collection] = JSON.parse(raw);
    } catch (err) {
      console.error(`Error loading ${collection}.json:`, err.message);
      this.cache[collection] = [];
    }
    return this.cache[collection];
  }

  save(collection) {
    this.ensureDirs();
    const fp = this.filePath(collection);
    const tmpPath = `${fp}.tmp`;
    const data = JSON.stringify(this.cache[collection] || [], null, 2);
    fs.writeFileSync(tmpPath, data, 'utf8');
    fs.renameSync(tmpPath, fp);
  }

  getAll(collection) {
    if (!this.cache[collection]) {
      this.load(collection);
    }
    return this.cache[collection];
  }

  findById(collection, id) {
    return this.getAll(collection).find((item) => item.id === id) || null;
  }

  find(collection, predicate) {
    return this.getAll(collection).filter(predicate);
  }

  findOne(collection, predicate) {
    return this.getAll(collection).find(predicate) || null;
  }

  insert(collection, item) {
    const list = this.getAll(collection);
    list.push(item);
    this.save(collection);
    return item;
  }

  insertMany(collection, items) {
    const list = this.getAll(collection);
    list.push(...items);
    this.save(collection);
    return items;
  }

  update(collection, id, updates) {
    const list = this.getAll(collection);
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...updates };
    this.save(collection);
    return list[idx];
  }

  remove(collection, id) {
    const list = this.getAll(collection);
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    this.save(collection);
    return true;
  }

  removeWhere(collection, predicate) {
    const list = this.getAll(collection);
    const next = list.filter((item) => !predicate(item));
    const removedCount = list.length - next.length;
    this.cache[collection] = next;
    if (removedCount > 0) {
      this.save(collection);
    }
    return removedCount;
  }

  /**
   * Releases any seat holds whose 10-minute timer has expired
   * and marks PENDING bookings as EXPIRED (FR-23 / Background Scheduler)
   */
  expireHeldSeats() {
    const now = Date.now();
    const seats = this.getAll('seats');
    let seatsChanged = false;

    for (const seat of seats) {
      if (seat.status === 'HELD' && seat.holdExpiresAt && new Date(seat.holdExpiresAt).getTime() <= now) {
        seat.status = 'AVAILABLE';
        seat.heldByUserId = null;
        seat.holdExpiresAt = null;
        seat.bookingId = null;
        seatsChanged = true;
      }
    }
    if (seatsChanged) {
      this.save('seats');
    }

    const bookings = this.getAll('bookings');
    let bookingsChanged = false;
    for (const booking of bookings) {
      if (booking.status === 'PENDING' && booking.holdExpiresAt && new Date(booking.holdExpiresAt).getTime() <= now) {
        booking.status = 'EXPIRED';
        bookingsChanged = true;
      }
    }
    if (bookingsChanged) {
      this.save('bookings');
    }

    return { seatsChanged, bookingsChanged };
  }

  /**
   * Creates a snapshot backup of all JSON collections (NFR-11)
   */
  createBackup(label = 'manual') {
    this.ensureDirs();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `backup-${label}-${timestamp}.json`;
    const snapshot = {
      backupId,
      createdAt: new Date().toISOString(),
      collections: {}
    };
    for (const col of COLLECTIONS) {
      snapshot.collections[col] = this.getAll(col);
    }
    const backupPath = path.join(BACKUP_DIR, backupId);
    fs.writeFileSync(backupPath, JSON.stringify(snapshot, null, 2), 'utf8');
    return {
      backupId,
      createdAt: snapshot.createdAt,
      counts: Object.fromEntries(COLLECTIONS.map((c) => [c, snapshot.collections[c].length]))
    };
  }

  listBackups() {
    this.ensureDirs();
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json'));
    return files
      .map((f) => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          backupId: f,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Restores collections from a backup snapshot (NFR-12)
   */
  restoreBackup(backupId) {
    const targetFile = backupId
      ? path.join(BACKUP_DIR, path.basename(backupId))
      : (() => {
          const list = this.listBackups();
          return list.length > 0 ? path.join(BACKUP_DIR, list[0].backupId) : null;
        })();

    if (!targetFile || !fs.existsSync(targetFile)) {
      throw new Error('Backup file not found');
    }
    const raw = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    if (!raw.collections) {
      throw new Error('Invalid backup format');
    }
    for (const col of COLLECTIONS) {
      if (Array.isArray(raw.collections[col])) {
        this.cache[col] = raw.collections[col];
        this.save(col);
      }
    }
    return {
      restoredFrom: path.basename(targetFile),
      restoredAt: new Date().toISOString()
    };
  }
}

const store = new JsonStore();
module.exports = { store, COLLECTIONS };
