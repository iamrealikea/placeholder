const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

const VIEW_FILES = {
  home: 'index.html',
  event: 'event.html',
  booking: 'booking.html',
  checkout: 'checkout.html',
  myTickets: 'my-tickets.html',
  profile: 'profile.html',
  scanner: 'scanner.html',
  support: 'support.html',
  admin: 'admin.html',
  adminEvent: 'admin-event.html',
  error: 'error.html'
};

function resolveViewPath(viewName) {
  const filename = VIEW_FILES[viewName] || viewName;
  return path.join(PUBLIC_DIR, filename);
}

function renderView(res, viewName) {
  return res.sendFile(resolveViewPath(viewName));
}

module.exports = {
  PUBLIC_DIR,
  VIEW_FILES,
  resolveViewPath,
  renderView
};
