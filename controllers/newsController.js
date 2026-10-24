const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const {
  fetchNewsForPreferences,
  searchNews,
  getCachedArticle,
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
  // Only accept articles previously cached from the news provider — never client-supplied payloads
  const article = await getCachedArticle(id);

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

function selectTopics(saved, requested) {
  const preferences = Array.isArray(saved)
    ? saved.filter((item) => typeof item === 'string')
    : [];

  if (requested === undefined) {
    return preferences;
  }

  const rawValues = Array.isArray(requested) ? requested : [requested];
  if (rawValues.some((item) => typeof item !== 'string')) {
    throw new AppError('Invalid preferences', 400);
  }

  const requestedTopics = rawValues
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean);

  if (requestedTopics.length === 0) {
    throw new AppError('Invalid preferences', 400);
  }

  const savedByKey = new Map(preferences.map((item) => [item.toLowerCase(), item]));
  const selected = [];

  for (const topic of requestedTopics) {
    const canonical = savedByKey.get(topic.toLowerCase());
    if (!canonical) {
      throw new AppError('Invalid preferences', 400);
    }
    if (!selected.includes(canonical)) {
      selected.push(canonical);
    }
  }

  return selected;
}

const getNews = asyncHandler(async (req, res) => {
  const topics = selectTopics(req.user.preferences, req.query.preferences);
  const news = await fetchNewsForPreferences(topics, req.user.language || 'en');
  return res.status(200).json({ news });
});

const search = asyncHandler(async (req, res) => {
  const news = await searchNews(req.params.keyword, req.user.language || 'en');
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
