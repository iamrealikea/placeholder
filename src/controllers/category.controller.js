const { CategoryModel } = require('../models');

function listCategories(_req, res) {
  return res.json({ categories: CategoryModel.findAll() });
}

function createCategory(req, res) {
  const { name } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required.' });
  }

  const cleanName = name.trim();
  if (cleanName.length > 50) {
    return res.status(400).json({ error: 'Category name must be 50 characters or fewer.' });
  }

  if (CategoryModel.findByName(cleanName)) {
    return res.status(409).json({ error: 'A category with this name already exists.' });
  }

  const category = CategoryModel.create(cleanName);
  if (!category) {
    return res.status(409).json({ error: 'A category with this name already exists.' });
  }

  return res.status(201).json({ message: 'Category created successfully.', category });
}

module.exports = { listCategories, createCategory };
