const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { store } = require('../store/jsonStore');
const { signToken, sanitizeUser, requireAuth } = require('../middleware/auth');

// Alias for authenticate middleware as per specification
const authenticate = requireAuth;

const router = express.Router();

// Configure avatar uploads directory and multer storage
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const rawExt = path.extname(file.originalname || '').toLowerCase();
    const allowedExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const ext = allowedExts.includes(rawExt) ? rawExt : '.png';
    const uniqueFilename = `avatar-${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
    cb(null, uniqueFilename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

/**
 * FR-02: User Registration
 * POST /api/auth/register
 * Validates required fields, checks for duplicate email/nationalId,
 * hashes password with bcryptjs (8 rounds), stores in JsonStore,
 * issues JWT token, sets tickethub_token cookie.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, age, phone, dob, gender, nationalId, address } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const emailNormalized = String(email).trim().toLowerCase();
    const existingUser = store.findOne('users', (u) => u.email && u.email.toLowerCase() === emailNormalized);
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    if (nationalId && String(nationalId).trim()) {
      const nid = String(nationalId).trim();
      const existingNid = store.findOne('users', (u) => u.nationalId && u.nationalId === nid);
      if (existingNid) {
        return res.status(409).json({ error: 'An account with this national ID already exists.' });
      }
    }

    // Min 8 salt rounds as required by NFR-04 and specification
    const passwordHash = await bcrypt.hash(password, 8);

    const newUser = {
      id: `usr-${uuidv4().slice(0, 8)}`,
      name: String(name).trim(),
      email: emailNormalized,
      phone: phone ? String(phone).trim() : '',
      age: Number(age) || 0,
      dob: dob ? String(dob).trim() : '',
      gender: gender ? String(gender).trim() : 'Unspecified',
      nationalId: nationalId ? String(nationalId).trim() : '',
      address: address ? String(address).trim() : '',
      avatarUrl: '',
      passwordHash,
      authProvider: 'local',
      role: 'customer',
      points: 100, // 100 welcome points
      bookmarks: [],
      createdAt: new Date().toISOString()
    };

    store.insert('users', newUser);

    const token = signToken(newUser);
    res.cookie('tickethub_token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 3600 * 1000 // 7 days
    });

    return res.status(201).json({
      message: 'Registration successful',
      token,
      user: sanitizeUser(newUser)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Registration failed due to server error: ' + err.message });
  }
});

/**
 * FR-01: User Login (Email & Password)
 * POST /api/auth/login
 * Validates credentials using bcryptjs, returns sanitized user object,
 * issues JWT token, sets tickethub_token cookie.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const emailNormalized = String(email).trim().toLowerCase();
    const user = store.findOne('users', (u) => u.email && u.email.toLowerCase() === emailNormalized);

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
      maxAge: 7 * 24 * 3600 * 1000 // 7 days
    });

    return res.json({
      message: 'Login successful',
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed due to server error: ' + err.message });
  }
});

/**
 * FR-01: Simulated Social & OTP Login
 * POST /api/auth/social-login
 * Supports provider ('gmail' | 'facebook' | 'phone' | 'google' | 'phone_otp'),
 * identifier, name, email. Finds or registers user, issues JWT and sets cookie.
 */
router.post('/social-login', (req, res) => {
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
      user = store.findOne('users', (u) => u.email && u.email.toLowerCase() === effectiveEmail);
    } else if (effectivePhone) {
      user = store.findOne('users', (u) => u.phone && u.phone === effectivePhone);
    }

    if (!user) {
      const displayName = name ? String(name).trim() : (effectiveEmail ? effectiveEmail.split('@')[0] : `User ${p}`);
      const fallbackEmail = effectiveEmail || (effectivePhone ? `${effectivePhone}@phone.sim` : `social_${uuidv4().slice(0, 8)}@tickethub.sim`);

      user = {
        id: `usr-${uuidv4().slice(0, 8)}`,
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
        points: 100, // 100 welcome points
        bookmarks: [],
        createdAt: new Date().toISOString()
      };
      store.insert('users', user);
    }

    const token = signToken(user);
    res.cookie('tickethub_token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 3600 * 1000 // 7 days
    });

    return res.json({
      message: `Logged in via ${p}`,
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Social login failed: ' + err.message });
  }
});

/**
 * FR-03: User Logout
 * POST /api/auth/logout
 * Clears tickethub_token cookie and returns success response.
 */
router.post('/logout', (_req, res) => {
  res.clearCookie('tickethub_token');
  return res.json({ message: 'Logged out successfully' });
});

/**
 * FR-04: View Profile / Current Authenticated User
 * GET /api/auth/me
 * GET /api/auth/profile
 * Protected by authenticate middleware, returns sanitized user object omitting passwordHash.
 */
router.get('/me', authenticate, (req, res) => {
  return res.json({ user: sanitizeUser(req.user) });
});

router.get('/profile', authenticate, (req, res) => {
  return res.json({ user: sanitizeUser(req.user) });
});

/**
 * FR-05: Edit Profile
 * PUT /api/auth/profile
 * Protected by authenticate middleware, updates personal fields:
 * name, phone, age, address, dob, gender, nationalId, avatarUrl.
 * Persists to JsonStore and returns sanitized user object.
 */
router.put('/profile', authenticate, (req, res) => {
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

    const updatedUser = store.update('users', req.user.id, updates);
    return res.json({
      message: 'Profile updated successfully',
      user: sanitizeUser(updatedUser)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Profile update failed: ' + err.message });
  }
});

/**
 * FR-05: Avatar Upload
 * POST /api/auth/avatar
 * Protected by authenticate middleware. Handles file upload via multer
 * or data URL / direct URL in JSON body.
 * Updates user profile with avatarUrl, returns { user, avatarUrl }.
 */
router.post(
  '/avatar',
  authenticate,
  (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Error uploading file' });
      }
      next();
    });
  },
  (req, res) => {
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

      const updatedUser = store.update('users', req.user.id, { avatarUrl });
      return res.json({
        message: 'Avatar updated successfully',
        avatarUrl,
        user: sanitizeUser(updatedUser)
      });
    } catch (err) {
      return res.status(500).json({ error: 'Avatar upload failed: ' + err.message });
    }
  }
);

module.exports = router;
