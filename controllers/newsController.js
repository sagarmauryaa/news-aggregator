const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const {
  fetchNewsForPreferences,
  searchNews,
  getCachedArticle,
  rememberArticle,
} = require('../services/newsService');

function upsertArticle(list, article) {
  const index = list.findIndex((item) => item.id === article.id);
  if (index === -1) {
    list.push(article);
  } else {
    list[index] = article;
  }
}

async function resolveArticle(req) {
  const { id } = req.params;
  let article = await getCachedArticle(id);

  if (!article && req.body && req.body.title) {
    article = {
      id,
      title: String(req.body.title),
      description: req.body.description || null,
      url: req.body.url || null,
      source: req.body.source || null,
      publishedAt: req.body.publishedAt || null,
      imageUrl: req.body.imageUrl || null,
    };
    await rememberArticle(article);
  }

  if (!article) {
    throw new AppError(
      'Article not found. Fetch /news or /news/search/:keyword first, then mark by id.',
      404
    );
  }

  return article;
}

async function markOnUser(req, field) {
  const article = await resolveArticle(req);
  upsertArticle(req.user[field], article);
  await req.user.save();
  return article;
}

const getNews = asyncHandler(async (req, res) => {
  const news = await fetchNewsForPreferences(req.user.preferences);
  return res.status(200).json({ news });
});

const search = asyncHandler(async (req, res) => {
  const news = await searchNews(req.params.keyword);
  return res.status(200).json({ news });
});

const markRead = asyncHandler(async (req, res) => {
  const article = await markOnUser(req, 'readArticles');
  return res.status(200).json({
    message: 'Article marked as read',
    article,
  });
});

const markFavorite = asyncHandler(async (req, res) => {
  const article = await markOnUser(req, 'favoriteArticles');
  return res.status(200).json({
    message: 'Article marked as favorite',
    article,
  });
});

const getRead = asyncHandler(async (req, res) => {
  return res.status(200).json({ news: req.user.readArticles });
});

const getFavorites = asyncHandler(async (req, res) => {
  return res.status(200).json({ news: req.user.favoriteArticles });
});

module.exports = {
  getNews,
  search,
  markRead,
  markFavorite,
  getRead,
  getFavorites,
};
