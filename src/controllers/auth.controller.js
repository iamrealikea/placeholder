const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { UserModel } = require('../models');
const { signToken, sanitizeUser } = require('../middleware/auth');

// In-memory concurrency locks to eliminate registration race conditions (TC-1.1, TC-1.2)
const inFlightEmails = new Set();
const inFlightNids = new Set();

const COOKIE_MAX_AGE_MS = 7 * 24 * 3600 * 1000; // 7 days

/**
 * FR-02: User Registration
 * POST /api/auth/register
 */
async function register(req, res) {
  const { name, email, password, age, phone, dob, gender, nationalId, address } = req.body || {};

  // Strict string type & non-empty validation (TC-2.1 to TC-2.5d)
  if (
    !name || typeof name !== 'string' || !name.trim() ||
    !email || typeof email !== 'string' || !email.trim() ||
    !password || typeof password !== 'string' || !password.trim()
  ) {
    return res.status(400).json({ error: 'Name, email, and password are required non-empty strings.' });
  }

  const emailNormalized = email.trim().toLowerCase();
  const nid = nationalId && String(nationalId).trim() ? String(nationalId).trim() : null;

  // Synchronous atomic check across in-flight set and database (TC-1.1, TC-1.3)
  if (inFlightEmails.has(emailNormalized) || UserModel.findByEmail(emailNormalized)) {
    return res.status(400).json({ error: 'An account with this email address already exists.' });
  }

  // Synchronous atomic check for National ID (TC-1.2, TC-1.4)
  if (nid) {
    if (inFlightNids.has(nid) || UserModel.findByNationalId(nid)) {
      return res.status(409).json({ error: 'An account with this national ID already exists.' });
    }
  }

  // Acquire in-flight locks before yielding to async bcrypt.hash
  inFlightEmails.add(emailNormalized);
  if (nid) inFlightNids.add(nid);

  try {
    // Min 8 salt rounds as required by NFR-04 and specification
    const passwordHash = await bcrypt.hash(password, 8);

    // Double-check store before insertion
    if (UserModel.findByEmail(emailNormalized)) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }
    if (nid && UserModel.findByNationalId(nid)) {
      return res.status(409).json({ error: 'An account with this national ID already exists.' });
    }

    const newUser = UserModel.create({
      name: String(name).trim(),
      email: emailNormalized,
      phone: phone ? String(phone).trim() : '',
      age: Number(age) || 0,
      dob: dob ? String(dob).trim() : '',
      gender: gender ? String(gender).trim() : 'Unspecified',
      nationalId: nid || '',
      address: address ? String(address).trim() : '',
      avatarUrl: '',
      passwordHash,
      authProvider: 'local',
      role: 'customer',
      points: 100,
      bookmarks: []
    });

    const token = signToken(newUser);
    res.cookie('tickethub_token', token, {
      httpOnly: true,
      maxAge: COOKIE_MAX_AGE_MS
    });

    return res.status(201).json({
      message: 'Registration successful',
      token,
      user: sanitizeUser(newUser)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Registration failed due to server error: ' + err.message });
  } finally {
    inFlightEmails.delete(emailNormalized);
    if (nid) inFlightNids.delete(nid);
  }
}

/**
 * FR-01: User Login (Email & Password)
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const { email, password } = req.body || {};

    if (
      !email || typeof email !== 'string' || !email.trim() ||
      !password || typeof password !== 'string' || !password.trim()
    ) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = UserModel.findByEmail(email);

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken(user);
    res.cookie('tickethub_token', token, {
      httpOnly: true,
      maxAge: COOKIE_MAX_AGE_MS
    });

    return res.json({
      message: 'Login successful',
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed due to server error: ' + err.message });
  }
}

/**
 * FR-01: Simulated Social & OTP Login
 * POST /api/auth/social-login
 */
function socialLogin(req, res) {
  try {
    const { provider, identifier, email, phone, name } = req.body;

    let p = String(provider || '').trim().toLowerCase();
    if (p === 'google') p = 'gmail';
    if (p === 'phone_otp') p = 'phone';

    if (!['gmail', 'facebook', 'phone'].includes(p)) {
      return res.status(400).json({ error: 'Invalid provider. Allowed: gmail, facebook, phone.' });
    }

    const effectiveEmail = email
      ? String(email).trim().toLowerCase()
      : (identifier && String(identifier).includes('@') ? String(identifier).trim().toLowerCase() : null);

    const effectivePhone = phone
      ? String(phone).trim()
      : (identifier && !String(identifier).includes('@') ? String(identifier).trim() : null);

    let user = null;
    if (effectiveEmail) {
      user = UserModel.findByEmail(effectiveEmail);
    } else if (effectivePhone) {
      user = UserModel.findByPhone(effectivePhone);
    }

    if (!user) {
      const displayName = name ? String(name).trim() : (effectiveEmail ? effectiveEmail.split('@')[0] : `User ${p}`);
      const fallbackEmail =
        effectiveEmail ||
        (effectivePhone ? `${effectivePhone}@phone.sim` : `social_${uuidv4().slice(0, 8)}@tickethub.sim`);

      user = UserModel.create({
        name: displayName,
        email: fallbackEmail,
        phone: effectivePhone || '',
        age: 20,
        dob: '2004-01-01',
        gender: 'Unspecified',
        nationalId: '',
        address: '',
        avatarUrl: '',
        passwordHash: '',
        authProvider: p,
        role: 'customer',
        points: 100,
        bookmarks: []
      });
    }

    const token = signToken(user);
    res.cookie('tickethub_token', token, {
      httpOnly: true,
      maxAge: COOKIE_MAX_AGE_MS
    });

    return res.json({
      message: `Logged in via ${p}`,
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Social login failed: ' + err.message });
  }
}

/**
 * FR-03: User Logout
 * POST /api/auth/logout
 */
function logout(_req, res) {
  res.clearCookie('tickethub_token');
  return res.json({ message: 'Logged out successfully' });
}

/**
 * FR-04: View Profile / Current Authenticated User
 * GET /api/auth/me & GET /api/auth/profile
 */
function getMe(req, res) {
  return res.json({ user: sanitizeUser(req.user) });
}

/**
 * FR-05: Edit Profile
 * PUT /api/auth/profile
 */
function updateProfile(req, res) {
  try {
    const allowed = ['name', 'phone', 'age', 'address', 'dob', 'gender', 'nationalId', 'avatarUrl'];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'age') {
          updates.age = Number(req.body.age) || 0;
        } else if (typeof req.body[key] === 'string') {
          updates[key] = req.body[key].trim();
        } else {
          updates[key] = req.body[key];
        }
      }
    }

    const updatedUser = UserModel.update(req.user.id, updates);
    return res.json({
      message: 'Profile updated successfully',
      user: sanitizeUser(updatedUser)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Profile update failed: ' + err.message });
  }
}

/**
 * FR-05: Avatar Upload
 * POST /api/auth/avatar
 */
function uploadAvatar(req, res) {
  try {
    let avatarUrl = '';
    if (req.file) {
      avatarUrl = `/uploads/${req.file.filename}`;
    } else if (req.body && (req.body.avatarUrl || req.body.avatarDataUrl || req.body.avatar)) {
      avatarUrl = req.body.avatarUrl || req.body.avatarDataUrl || req.body.avatar;
    }

    if (!avatarUrl) {
      return res.status(400).json({ error: 'No avatar image uploaded.' });
    }

    const updatedUser = UserModel.update(req.user.id, { avatarUrl });
    return res.json({
      message: 'Avatar updated successfully',
      avatarUrl,
      user: sanitizeUser(updatedUser)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Avatar upload failed: ' + err.message });
  }
}

module.exports = {
  register,
  login,
  socialLogin,
  logout,
  getMe,
  getProfile: getMe,
  updateProfile,
  uploadAvatar
};
