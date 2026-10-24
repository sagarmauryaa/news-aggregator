const express = require('express');
const authenticate = require('../middleware/authMiddleware');
const validate = require('../middleware/validateMiddleware');
const { searchSchema, articleParamsSchema } = require('../validators/schemas');
const {
  getNews,
  search,
  markRead,
  markFavorite,
  getRead,
  getFavorites,
} = require('../controllers/newsController');

const router = express.Router();

router.use(authenticate);

router.get('/', getNews);
router.get('/read', getRead);
router.get('/favorites', getFavorites);
router.get('/search/:keyword', validate(searchSchema), search);
router.post('/:id/read', validate(articleParamsSchema), markRead);
router.post('/:id/favorite', validate(articleParamsSchema), markFavorite);

module.exports = router;
