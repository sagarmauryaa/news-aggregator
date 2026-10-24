const express = require('express');
const authenticate = require('../middleware/authMiddleware');
const validate = require('../middleware/validateMiddleware');
const {
  signupSchema,
  loginSchema,
  updatePreferencesSchema,
} = require('../validators/schemas');
const {
  signup,
  login,
  getPreferences,
  updatePreferences,
} = require('../controllers/userController');

const router = express.Router();

router.post('/signup', validate(signupSchema), signup);
router.post('/login', validate(loginSchema), login);

router.get('/preferences', authenticate, getPreferences);
router.put('/preferences', authenticate, validate(updatePreferencesSchema), updatePreferences);

module.exports = router;
