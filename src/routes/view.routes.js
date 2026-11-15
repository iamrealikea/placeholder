const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const viewController = require('../controllers/view.controller');

const router = express.Router();

router.get('/', (req, res) => res.redirect('/home'));
router.get('/home', viewController.renderHome);
router.get('/event', viewController.renderEvent);
router.get('/booking', viewController.renderBooking);
router.get('/checkout', optionalAuth, viewController.renderCheckout);
router.get('/my-tickets', viewController.renderMyTickets);
router.get('/profile', viewController.renderProfile);
router.get('/scanner', viewController.renderScanner);
router.get('/support', viewController.renderSupport);
router.get('/admin', viewController.renderAdmin);
router.get('/admin-event', viewController.renderAdminEvent);
router.get('/403', viewController.render403);
router.get('/404', viewController.render404);

module.exports = router;
