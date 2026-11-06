const express = require('express');
const viewController = require('../controllers/view.controller');

const router = express.Router();

router.get('/', (req, res) => res.redirect('/home'));
router.get('/home', viewController.renderHome);
router.get('/event', viewController.renderEvent);
router.get('/booking', viewController.renderBooking);
router.get('/checkout', viewController.renderCheckout);
router.get('/my-tickets', viewController.renderMyTickets);
router.get('/profile', viewController.renderProfile);
router.get('/scanner', viewController.renderScanner);
router.get('/support', viewController.renderSupport);
router.get('/admin', viewController.renderAdmin);
router.get('/admin-event', viewController.renderAdminEvent);

module.exports = router;
