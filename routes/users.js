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

// Problem-statement paths. These are separate from /users/signup because the
// shipped tests call /users/signup while the assignment also calls /register.
const assignmentRouter = express.Router();

assignmentRouter.post('/register', validate(signupSchema), signup);
assignmentRouter.post('/login', validate(loginSchema), login);
assignmentRouter.get('/preferences', authenticate, getPreferences);
assignmentRouter.put('/preferences', authenticate, validate(updatePreferencesSchema), updatePreferences);

module.exports = router;
module.exports.assignmentRouter = assignmentRouter;
