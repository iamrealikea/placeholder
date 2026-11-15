const { v4: uuidv4 } = require('uuid');
const { store } = require('../store/jsonStore');

class CategoryModel {
  static findAll() {
    return store.getAll('categories')
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  static findByName(name) {
    if (typeof name !== 'string') return null;
    const normalized = name.trim().toLowerCase();
    if (!normalized) return null;
    return store.findOne('categories', (category) =>
      typeof category.name === 'string' && category.name.trim().toLowerCase() === normalized
    );
  }

  static create(name) {
    const cleanName = name.trim();
    if (this.findByName(cleanName)) return null;
    return store.insert('categories', {
      id: `cat-${uuidv4().slice(0, 8)}`,
      name: cleanName,
      createdAt: new Date().toISOString()
    });
  }
}

module.exports = CategoryModel;
