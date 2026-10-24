const crypto = require('crypto');
const axios = require('axios');
const AppError = require('../utils/AppError');
const { NEWS_LANGUAGES } = require('../validators/constants');

const FEED_TTL_MS = seconds(process.env.CACHE_TTL_SECONDS, 3600);
const ARTICLE_TTL_MS = seconds(process.env.ARTICLE_CACHE_TTL_SECONDS, 86400);
const STALE_JOB_MS = 24 * 60 * 60 * 1000;
const MAX_FEEDS = positiveInt(process.env.CACHE_MAX_FEEDS, 100);
const MAX_ARTICLES = positiveInt(process.env.CACHE_MAX_ARTICLES, 1000);
const SUPPORTED_LANGUAGES = new Set(NEWS_LANGUAGES);

// key -> { articles, storedAt }
const feeds = new Map();
// id -> { article, expiresAt }
const articlesById = new Map();
// key -> { topics, language, lastAccess }
const refreshJobs = new Map();

let refreshTimer = null;
let refreshing = false;

function seconds(value, fallback) {
  const parsed = Number(value);
  const chosen = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.floor(chosen) * 1000;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function newsApiUrl() {
  return process.env.NEWS_API_BASE_URL || 'https://newsapi.org/v2/everything';
}

function resolveLanguage(language) {
  const selected = language === undefined || language === null || language === ''
    ? 'en'
    : String(language).trim().toLowerCase();

  if (!SUPPORTED_LANGUAGES.has(selected)) {
    throw new AppError('Unsupported news language', 400);
  }

  return selected;
}

function articleId(url, title) {
  return crypto
    .createHash('sha256')
    .update(String(url || title || ''))
    .digest('hex')
    .slice(0, 16);
}

function normalizeArticle(article) {
  const source = article.source;
  return {
    id: articleId(article.url, article.title),
    title: article.title,
    description: article.description ?? null,
    url: article.url || null,
    source: source?.name || (typeof source === 'string' ? source : null),
    publishedAt: article.publishedAt || null,
    imageUrl: article.urlToImage || article.imageUrl || null,
  };
}

function buildQuery(topics) {
  const terms = (topics || [])
    .map((topic) => String(topic).trim())
    .filter(Boolean)
    .map((topic) => (/\s/.test(topic) ? `"${topic.replace(/"/g, '')}"` : topic));

  return terms.length > 0 ? terms.join(' OR ') : 'general';
}

function feedKey(topics, language) {
  const topicKey = topics
    .map((topic) => String(topic).trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');

  return `${language}::${topicKey}`;
}

function enforceLimit(map, maxSize) {
  while (map.size > maxSize) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
}

function evictExpiredCaches(now = Date.now()) {
  for (const [key, entry] of feeds) {
    if (now - entry.storedAt > FEED_TTL_MS) {
      feeds.delete(key);
    }
  }

  for (const [id, entry] of articlesById) {
    if (now > entry.expiresAt) {
      articlesById.delete(id);
    }
  }
}

function evictStaleJobs(now = Date.now()) {
  for (const [key, job] of [...refreshJobs.entries()]) {
    if (now - job.lastAccess > STALE_JOB_MS) {
      refreshJobs.delete(key);
    }
  }
}

function readFeed(key) {
  const entry = feeds.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.storedAt > FEED_TTL_MS) {
    feeds.delete(key);
    return null;
  }

  feeds.delete(key);
  feeds.set(key, entry);
  return entry.articles;
}

function saveFeed(key, articles) {
  evictExpiredCaches();

  if (feeds.has(key)) {
    feeds.delete(key);
  }
  feeds.set(key, { articles, storedAt: Date.now() });
  enforceLimit(feeds, MAX_FEEDS);

  const expiresAt = Date.now() + ARTICLE_TTL_MS;
  articles.forEach((article) => {
    if (articlesById.has(article.id)) {
      articlesById.delete(article.id);
    }
    articlesById.set(article.id, { article, expiresAt });
  });
  enforceLimit(articlesById, MAX_ARTICLES);
}

function trackRefresh(key, topics, language) {
  if (refreshJobs.has(key)) {
    refreshJobs.delete(key);
  }
  refreshJobs.set(key, { topics, language, lastAccess: Date.now() });
  enforceLimit(refreshJobs, MAX_FEEDS);
}

async function fetchRemoteArticles(query, sortBy, language) {
  const selectedLanguage = resolveLanguage(language);
  const apiKey = (process.env.NEWS_API_KEY || '').trim();
  if (!apiKey) {
    throw new AppError('News API key is not configured', 503);
  }

  try {
    const { data } = await axios.get(newsApiUrl(), {
      headers: { 'X-Api-Key': apiKey },
      params: { q: query, language: selectedLanguage, sortBy, pageSize: 20 },
      timeout: 10000,
    });

    if (!data || data.status === 'error') {
      throw new AppError(data?.message || 'Failed to fetch news from the provider', 502);
    }

    return (data.articles || [])
      .filter((article) => article && article.title && article.title !== '[Removed]')
      .map(normalizeArticle);
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    if (err.response?.status === 429) {
      throw new AppError('News provider rate limit exceeded', 503);
    }
    throw new AppError('Failed to fetch news from the provider', err.response ? 502 : 503);
  }
}

async function fetchNewsForPreferences(preferences = [], language = 'en') {
  const selectedLanguage = resolveLanguage(language);
  const topics = preferences.length > 0 ? preferences : ['general'];
  const key = feedKey(topics, selectedLanguage);

  trackRefresh(key, topics, selectedLanguage);

  const cached = readFeed(key);
  if (cached) {
    return cached;
  }

  const articles = await fetchRemoteArticles(buildQuery(topics), 'publishedAt', selectedLanguage);
  saveFeed(key, articles);
  return articles;
}

async function searchNews(keyword, language = 'en') {
  const selectedLanguage = resolveLanguage(language);
  const term = String(keyword || '').trim();
  if (!term) {
    return [];
  }

  const key = feedKey([`search:${term}`], selectedLanguage);
  const cached = readFeed(key);
  if (cached) {
    return cached;
  }

  const articles = await fetchRemoteArticles(term, 'relevancy', selectedLanguage);
  saveFeed(key, articles);
  return articles;
}

async function getCachedArticle(id) {
  const entry = articlesById.get(id);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    articlesById.delete(id);
    return null;
  }

  articlesById.delete(id);
  articlesById.set(id, entry);
  return entry.article;
}

async function refreshCachedNews() {
  if (refreshing) {
    return { updated: 0, skipped: true };
  }

  refreshing = true;
  let updated = 0;

  try {
    evictStaleJobs();

    for (const [key, job] of [...refreshJobs.entries()]) {
      if (Date.now() - job.lastAccess > STALE_JOB_MS) {
        refreshJobs.delete(key);
        continue;
      }

      try {
        const articles = await fetchRemoteArticles(
          buildQuery(job.topics),
          'publishedAt',
          job.language || 'en'
        );
        saveFeed(key, articles);
        updated += 1;
      } catch (err) {
        console.error('News refresh skipped:', err.message);
      }
    }
  } finally {
    refreshing = false;
  }

  return { updated };
}

function startPeriodicRefresh(intervalMs = Number(process.env.CACHE_REFRESH_MS) || 30 * 60 * 1000) {
  if (refreshTimer) {
    return;
  }

  const every = Number(intervalMs) > 0 ? Number(intervalMs) : 30 * 60 * 1000;
  refreshTimer = setInterval(() => {
    evictExpiredCaches();
    evictStaleJobs();
    refreshCachedNews().catch((err) => {
      console.error('Periodic cache refresh failed:', err.message);
    });
  }, every);

  if (typeof refreshTimer.unref === 'function') {
    refreshTimer.unref();
  }
}

function stopPeriodicRefresh() {
  if (!refreshTimer) {
    return;
  }
  clearInterval(refreshTimer);
  refreshTimer = null;
}

module.exports = {
  fetchNewsForPreferences,
  searchNews,
  getCachedArticle,
  refreshCachedNews,
  startPeriodicRefresh,
  stopPeriodicRefresh,
};
