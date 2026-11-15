const express = require('express');
const { requireRole } = require('../middleware/auth');
const categoryController = require('../controllers/category.controller');

const router = express.Router();

router.get('/', categoryController.listCategories);
router.post('/', requireRole(['admin']), categoryController.createCategory);

module.exports = router;
