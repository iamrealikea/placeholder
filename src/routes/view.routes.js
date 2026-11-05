const express = require('express');
const viewController = require('../controllers/view.controller');

const router = express.Router();

router.get('/', viewController.renderHome);
router.get('/index.html', viewController.renderHome);
router.get('/event.html', viewController.renderEvent);
router.get('/booking.html', viewController.renderBooking);
router.get('/checkout.html', viewController.renderCheckout);
router.get('/my-tickets.html', viewController.renderMyTickets);
router.get('/profile.html', viewController.renderProfile);
router.get('/scanner.html', viewController.renderScanner);
router.get('/support.html', viewController.renderSupport);
router.get('/admin.html', viewController.renderAdmin);

module.exports = router;
