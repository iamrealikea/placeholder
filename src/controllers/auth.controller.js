const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { UserModel } = require('../models');
const { signToken, sanitizeUser } = require('../middleware/auth');
const socialAuth = require('../services/socialAuth');

// In-memory concurrency locks to eliminate registration race conditions (TC-1.1, TC-1.2)
const inFlightEmails = new Set();
const inFlightNids = new Set();

const COOKIE_MAX_AGE_MS = 7 * 24 * 3600 * 1000; // 7 days

function isValidDateOfBirth(value) {
  if (!value) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10);
}

function isValidAvatarUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  const cleaned = lower.replace(/[\s\x00-\x1f\x7f-\x9f]/g, '');

  // Strictly reject dangerous schemes
  if (
    cleaned.startsWith('javascript:') ||
    cleaned.startsWith('vbscript:') ||
    cleaned.startsWith('data:text/') ||
    cleaned.includes('javascript:') ||
    cleaned.includes('vbscript:')
  ) {
    return false;
  }

  // Reject directory traversal
  if (trimmed.includes('..')) {
    return false;
  }

  // Accept only http://, https://, and /uploads/ (or relative path)
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return true;
  }

  if (trimmed.startsWith('/uploads/')) {
    return true;
  }

  // Accept valid base64 image data URIs
  if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return true;
  }

  // Relative path without protocol scheme (no colon) and no protocol-relative '//'
  if (!trimmed.includes(':') && !trimmed.startsWith('//')) {
    return true;
  }

  return false;
}

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

  if (!isValidDateOfBirth(dob)) {
    return res.status(400).json({ error: 'Date of birth must be a valid date that is not in the future.' });
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

const SOCIAL_FORBIDDEN_MSG = 'Cannot sign in via social login for this account. Please use password login.';

function issueSession(res, user) {
  const token = signToken(user);
  res.cookie('tickethub_token', token, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_MS
  });
  return token;
}

/**
 * Public (non-secret) provider settings used by the browser to start Google / Facebook login.
 * GET /api/auth/social-config
 */
function getSocialConfig(_req, res) {
  return res.json(socialAuth.getPublicConfig());
}

/**
 * Demo-only simulated phone OTP login (no real OTP is sent or checked).
 * Disabled in production unless ALLOW_SIMULATED_PHONE_LOGIN=true.
 */
function phoneDemoLogin(req, res) {
  if (!socialAuth.isPhoneDemoEnabled()) {
    return res.status(403).json({ error: 'Phone OTP login is not available.' });
  }

  const { identifier, phone, name } = req.body || {};
  const effectivePhone = phone
    ? String(phone).trim()
    : (identifier ? String(identifier).trim() : '');

  if (!effectivePhone) {
    return res.status(400).json({ error: 'A phone number is required.' });
  }

  let user = UserModel.findByPhone(effectivePhone);

  if (user) {
    if (
      user.authProvider === 'local' ||
      user.role === 'admin' ||
      user.role === 'staff' ||
      (user.authProvider && user.authProvider !== 'phone')
    ) {
      return res.status(403).json({ error: SOCIAL_FORBIDDEN_MSG });
    }
  } else {
    user = UserModel.create({
      name: name ? String(name).trim() : 'User phone',
      email: `${effectivePhone}@phone.sim`,
      phone: effectivePhone,
      age: 20,
      dob: '2004-01-01',
      gender: 'Unspecified',
      nationalId: '',
      address: '',
      avatarUrl: '',
      passwordHash: '',
      authProvider: 'phone',
      role: 'customer',
      points: 100,
      bookmarks: []
    });
  }

  const token = issueSession(res, user);
  return res.json({ message: 'Logged in via phone', token, user: sanitizeUser(user) });
}

/**
 * FR-01: Google / Facebook login (+ demo phone OTP)
 * POST /api/auth/social-login
 *   Google:   { provider: 'gmail' | 'google', idToken }
 *   Facebook: { provider: 'facebook', accessToken }
 * The token is verified with the provider; any email/name sent by the client is ignored.
 */
async function socialLogin(req, res) {
  try {
    const body = req.body || {};

    let p = String(body.provider || '').trim().toLowerCase();
    if (p === 'google') p = 'gmail';
    if (p === 'phone_otp') p = 'phone';

    if (!['gmail', 'facebook', 'phone'].includes(p)) {
      return res.status(400).json({ error: 'Invalid provider. Allowed: gmail, facebook, phone.' });
    }

    if (p === 'phone') {
      return phoneDemoLogin(req, res);
    }

    const rawToken = [body.idToken, body.accessToken, body.token].find((t) => typeof t === 'string' && t.trim());
    if (!rawToken) {
      return res.status(400).json({
        error: 'A provider token is required (idToken for Google, accessToken for Facebook).'
      });
    }

    let profile;
    try {
      profile = await socialAuth.verifyProviderToken(p, rawToken.trim());
    } catch (err) {
      if (err instanceof socialAuth.SocialAuthError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }

    const idField = p === 'gmail' ? 'googleId' : 'facebookId';
    let user = UserModel.findBySocialId(p, profile.providerId);
    let isNewUser = false;

    // First time with this provider account: try to attach it to an existing social account by verified email
    if (!user && profile.email) {
      if (!profile.emailVerified) {
        return res.status(403).json({ error: 'The email address of this account has not been verified by the provider.' });
      }
      const existing = UserModel.findByEmail(profile.email);
      if (existing) {
        if (
          existing.role !== 'customer' ||
          existing.authProvider === 'local'
        ) {
          return res.status(403).json({ error: SOCIAL_FORBIDDEN_MSG });
        }
        // A provider-verified matching email can link another social login to this customer account.
        user = UserModel.update(existing.id, { [idField]: profile.providerId });
      }
    }

    // Social login is never allowed for privileged accounts (even if a role was changed later)
    if (user && user.role !== 'customer') {
      return res.status(403).json({ error: SOCIAL_FORBIDDEN_MSG });
    }

    if (!user) {
      const email = profile.email || `${profile.providerId}@${p}.noemail.invalid`;
      user = UserModel.create({
        name: profile.name || (profile.email ? profile.email.split('@')[0] : `User ${p}`),
        email,
        phone: '',
        age: 0,
        dob: '',
        gender: 'Unspecified',
        nationalId: '',
        address: '',
        avatarUrl: profile.avatarUrl || '',
        passwordHash: '',
        authProvider: p,
        [idField]: profile.providerId,
        role: 'customer',
        points: 100,
        bookmarks: []
      });
      isNewUser = true;
    }

    const token = issueSession(res, user);
    return res.json({
      message: `Logged in via ${p}`,
      token,
      isNewUser,
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
    const body = req.body || {};

    if (body.dob !== undefined && !isValidDateOfBirth(body.dob)) {
      return res.status(400).json({ error: 'Date of birth must be a valid date that is not in the future.' });
    }

    const textFields = ['name', 'phone', 'address', 'dob', 'gender', 'nationalId', 'avatarUrl'];
    const updates = {};

    if (body.age !== undefined) {
      if (typeof body.age !== 'number' && typeof body.age !== 'string') {
        return res.status(400).json({ error: 'Field "age" must be a number.' });
      }
      const parsedAge = parseInt(body.age, 10);
      updates.age = Number.isNaN(parsedAge) || parsedAge < 0 ? 0 : parsedAge;
    }

    for (const key of textFields) {
      if (body[key] !== undefined) {
        if (typeof body[key] !== 'string') {
          return res.status(400).json({ error: `Field "${key}" must be a string.` });
        }

        const val = body[key].trim();

        if (key === 'nationalId') {
          if (val) {
            const existing = UserModel.findByNationalId(val);
            if (existing && existing.id !== req.user.id) {
              return res.status(409).json({ error: 'An account with this national ID already exists.' });
            }
          }
        }

        if (key === 'avatarUrl') {
          if (val && !isValidAvatarUrl(val)) {
            return res.status(400).json({ error: 'Invalid or disallowed avatar URL scheme.' });
          }
        }

        updates[key] = val;
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
    } else if (req.body && (req.body.avatarUrl !== undefined || req.body.avatarDataUrl !== undefined || req.body.avatar !== undefined)) {
      const candidate = req.body.avatarUrl !== undefined
        ? req.body.avatarUrl
        : (req.body.avatarDataUrl !== undefined ? req.body.avatarDataUrl : req.body.avatar);

      if (typeof candidate !== 'string') {
        return res.status(400).json({ error: 'Invalid or disallowed avatar URL scheme.' });
      }

      if (!candidate.trim()) {
        return res.status(400).json({ error: 'No avatar image uploaded.' });
      }

      if (!isValidAvatarUrl(candidate)) {
        return res.status(400).json({ error: 'Invalid or disallowed avatar URL scheme.' });
      }

      avatarUrl = candidate.trim();
    }

    if (!avatarUrl) {
      return res.status(400).json({ error: 'No avatar image uploaded.' });
    }

    if (!isValidAvatarUrl(avatarUrl)) {
      return res.status(400).json({ error: 'Invalid or disallowed avatar URL scheme.' });
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
  getSocialConfig,
  logout,
  getMe,
  getProfile: getMe,
  updateProfile,
  uploadAvatar
};