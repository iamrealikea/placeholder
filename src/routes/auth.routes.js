const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { uploadAvatarMiddleware } = require('../middleware/upload');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/social-login', authController.socialLogin);
router.post('/logout', authController.logout);

router.get('/me', requireAuth, authController.getMe);
router.get('/profile', requireAuth, authController.getProfile);
router.put('/profile', requireAuth, authController.updateProfile);
router.post('/avatar', requireAuth, uploadAvatarMiddleware, authController.uploadAvatar);

module.exports = router;
