const { renderView } = require('../views');

function renderHome(_req, res) {
  return renderView(res, 'home');
}

function renderEvent(_req, res) {
  return renderView(res, 'event');
}

function renderBooking(_req, res) {
  return renderView(res, 'booking');
}

function renderCheckout(_req, res) {
  return renderView(res, 'checkout');
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
  getHealth
};
