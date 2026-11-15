const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !process.env.JWT_SECRET.trim())) {
  throw new Error('FATAL: JWT_SECRET environment variable is required in production.');
}

const JWT_SECRET = (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) || 'tickethub-secret-key-2026';

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  if (req.cookies && req.cookies.tickethub_token) {
    return req.cookies.tickethub_token;
  }
  return null;
}

function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = UserModel.findById(decoded.id);
    req.user = user || null;
  } catch (_) {
    req.user = null;
  }
  return next();
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = UserModel.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists.' });
    }
    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }
}

function requireRole(roles = []) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          error: `Forbidden: requires role [${roles.join(', ')}]`
        });
      }
      return next();
    });
  };
}

module.exports = {
  JWT_SECRET,
  signToken,
  sanitizeUser,
  optionalAuth,
  requireAuth,
  requireRole
};
