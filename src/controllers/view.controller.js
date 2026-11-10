const { renderView, resolveViewPath } = require('../views');
const { BookingModel } = require('../models');

function renderHome(_req, res) {
  return renderView(res, 'home');
}

function renderEvent(_req, res) {
  return renderView(res, 'event');
}

function renderBooking(_req, res) {
  return renderView(res, 'booking');
}

function renderCheckout(req, res) {
  const { bookingId } = req.query;
  if (bookingId) {
    const booking = BookingModel.findById(bookingId);
    if (!booking) {
      return res.status(404).sendFile(resolveViewPath('error'));
    }
    if (req.user && booking.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).sendFile(resolveViewPath('error'));
    }
  }
  return renderView(res, 'checkout');
}

function render403(_req, res) {
  return res.status(403).sendFile(resolveViewPath('error'));
}

function render404(_req, res) {
  return res.status(404).sendFile(resolveViewPath('error'));
}

function renderMyTickets(_req, res) {
  return renderView(res, 'myTickets');
}

function renderProfile(_req, res) {
  return renderView(res, 'profile');
}

function renderScanner(_req, res) {
  return renderView(res, 'scanner');
}

function renderSupport(_req, res) {
  return renderView(res, 'support');
}

function renderAdmin(_req, res) {
  return renderView(res, 'admin');
}

function renderAdminEvent(_req, res) {
  return renderView(res, 'adminEvent');
}

function getHealth(_req, res) {
  return res.json({
    status: 'ok',
    system: 'TicketHub Platform',
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  renderHome,
  renderEvent,
  renderBooking,
  renderCheckout,
  renderMyTickets,
  renderProfile,
  renderScanner,
  renderSupport,
  renderAdmin,
  renderAdminEvent,
  render403,
  render404,
  getHealth
};
