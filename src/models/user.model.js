const { v4: uuidv4 } = require('uuid');
const { store } = require('../store/jsonStore');

class UserModel {
  static findAll() {
    return store.getAll('users');
  }

  static findById(id) {
    return store.findById('users', id);
  }

  static findByEmail(email) {
    if (!email || typeof email !== 'string') return null;
    const normalized = email.trim().toLowerCase();
    return store.findOne('users', (u) => u.email && u.email.toLowerCase() === normalized);
  }

  static findByNationalId(nid) {
    if (!nid || typeof nid !== 'string') return null;
    const trimmed = nid.trim();
    if (!trimmed) return null;
    return store.findOne('users', (u) => u.nationalId && u.nationalId === trimmed);
  }

  static findByPhone(phone) {
    if (!phone || typeof phone !== 'string') return null;
    const trimmed = phone.trim();
    if (!trimmed) return null;
    return store.findOne('users', (u) => u.phone && u.phone === trimmed);
  }

  /** provider: 'gmail' | 'facebook'. Looks a user up by the provider's stable account ID. */
  static findBySocialId(provider, providerId) {
    const field = provider === 'gmail' ? 'googleId' : provider === 'facebook' ? 'facebookId' : null;
    if (!field || !providerId) return null;
    const id = String(providerId);
    return store.findOne('users', (u) => u[field] && u[field] === id);
  }

  static create(data) {
    const newUser = {
      id: data.id || `usr-${uuidv4().slice(0, 8)}`,
      name: String(data.name || '').trim(),
      email: String(data.email || '').trim().toLowerCase(),
      phone: data.phone ? String(data.phone).trim() : '',
      age: Number(data.age) || 0,
      dob: data.dob ? String(data.dob).trim() : '',
      gender: data.gender ? String(data.gender).trim() : 'Unspecified',
      nationalId: data.nationalId ? String(data.nationalId).trim() : '',
      address: data.address ? String(data.address).trim() : '',
      avatarUrl: data.avatarUrl || '',
      passwordHash: data.passwordHash || '',
      authProvider: data.authProvider || 'local',
      googleId: data.googleId ? String(data.googleId) : '',
      facebookId: data.facebookId ? String(data.facebookId) : '',
      role: data.role || 'customer',
      points: data.points !== undefined ? Number(data.points) : 100,
      bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
      createdAt: data.createdAt || new Date().toISOString()
    };

    return store.insert('users', newUser);
  }

  static update(id, updates) {
    return store.update('users', id, updates);
  }

  static toggleBookmark(userId, eventId) {
    const user = this.findById(userId);
    if (!user) return null;

    const bookmarks = new Set(user.bookmarks || []);
    let isBookmarked = false;

    if (bookmarks.has(eventId)) {
      bookmarks.delete(eventId);
      isBookmarked = false;
    } else {
      bookmarks.add(eventId);
      isBookmarked = true;
    }

    const updatedBookmarks = Array.from(bookmarks);
    this.update(userId, { bookmarks: updatedBookmarks });

    return {
      isBookmarked,
      bookmarks: updatedBookmarks
    };
  }

  static adjustPoints(userId, pointsUsed = 0, pointsEarned = 0) {
    const user = this.findById(userId);
    if (!user) return null;
    const newPoints = Math.max(0, (user.points || 0) - (pointsUsed || 0) + (pointsEarned || 0));
    return this.update(userId, { points: newPoints });
  }

  static getRoleCounts() {
    const allUsers = this.findAll();
    return {
      total: allUsers.length,
      admin: allUsers.filter((u) => u.role === 'admin').length,
      staff: allUsers.filter((u) => u.role === 'staff').length,
      customer: allUsers.filter((u) => u.role === 'customer').length
    };
  }

  static filterUsers({ role, search } = {}) {
    let filtered = this.findAll();

    if (role && typeof role === 'string' && role.trim().toLowerCase() !== 'all') {
      const targetRole = role.trim().toLowerCase();
      filtered = filtered.filter((u) => u.role && u.role.toLowerCase() === targetRole);
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((u) => {
        const nameMatch = u.name && typeof u.name === 'string' && u.name.toLowerCase().includes(q);
        const emailMatch = u.email && typeof u.email === 'string' && u.email.toLowerCase().includes(q);
        const phoneMatch = u.phone && typeof u.phone === 'string' && u.phone.toLowerCase().includes(q);
        return Boolean(nameMatch || emailMatch || phoneMatch);
      });
    }

    return filtered;
  }
}

module.exports = UserModel;