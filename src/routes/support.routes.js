const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const supportController = require('../controllers/support.controller');

const router = express.Router();

router.post('/', requireAuth, supportController.createInquiry);
router.get('/my', requireAuth, supportController.getMyInquiries);
router.get('/all', requireRole(['admin']), supportController.getAllInquiries);
router.put('/:id/reply', requireRole(['admin']), supportController.replyInquiry);

module.exports = router;
