const crypto = require('crypto');
const axios = require('axios');
const AppError = require('../utils/AppError');

const FEED_TTL_MS = seconds(process.env.CACHE_TTL_SECONDS, 3600);
const ARTICLE_TTL_MS = seconds(process.env.ARTICLE_CACHE_TTL_SECONDS, 86400);
const STALE_JOB_MS = 24 * 60 * 60 * 1000;

// key -> { articles, storedAt }
const feeds = new Map();
// id -> { article, expiresAt }
const articlesById = new Map();
// key -> { topics, lastAccess }
const refreshJobs = new Map();

let refreshTimer = null;
let refreshing = false;

function seconds(value, fallback) {
  const parsed = Number(value);
  const chosen = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.floor(chosen) * 1000;
}

function newsApiUrl() {
  return process.env.NEWS_API_BASE_URL || 'https://newsapi.org/v2/everything';
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

function feedKey(topics) {
  return topics
    .map((topic) => String(topic).trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

function fallbackArticle(message) {
  return {
    id: articleId('fallback', message),
    title: 'News unavailable',
    description: `News fetch failed: ${message}`,
    url: null,
    source: 'fallback',
    publishedAt: null,
    imageUrl: null,
  };
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
  return entry.articles;
}

function saveFeed(key, articles) {
  feeds.set(key, { articles, storedAt: Date.now() });
  const expiresAt = Date.now() + ARTICLE_TTL_MS;
  articles.forEach((article) => {
    articlesById.set(article.id, { article, expiresAt });
  });
}

async function fetchRemoteArticles(query, sortBy) {
  const apiKey = (process.env.NEWS_API_KEY || '').trim();
  if (!apiKey) {
    throw new AppError('News API key is not configured', 503);
  }

  try {
    const { data } = await axios.get(newsApiUrl(), {
      headers: { 'X-Api-Key': apiKey },
      params: { q: query, language: 'en', sortBy, pageSize: 20 },
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

async function fetchNewsForPreferences(preferences = []) {
  const topics = preferences.length > 0 ? preferences : ['general'];
  const key = feedKey(topics);

  refreshJobs.set(key, { topics, lastAccess: Date.now() });

  const cached = readFeed(key);
  if (cached) {
    return cached;
  }

  try {
    const articles = await fetchRemoteArticles(buildQuery(topics), 'publishedAt');
    saveFeed(key, articles);
    return articles;
  } catch (err) {
    return [fallbackArticle(err.message)];
  }
}

async function searchNews(keyword) {
  const term = String(keyword || '').trim();
  if (!term) {
    return [];
  }

  const key = `search:${term.toLowerCase()}`;
  const cached = readFeed(key);
  if (cached) {
    return cached;
  }

  const articles = await fetchRemoteArticles(term, 'relevancy');
  saveFeed(key, articles);
  return articles;
}

async function getCachedArticle(id) {
  const entry = articlesById.get(id);
  if (!entry || Date.now() > entry.expiresAt) {
    articlesById.delete(id);
    return null;
  }
  return entry.article;
}

async function rememberArticle(article) {
  if (article?.id) {
    articlesById.set(article.id, { article, expiresAt: Date.now() + ARTICLE_TTL_MS });
  }
}

async function refreshCachedNews() {
  if (refreshing) {
    return { updated: 0, skipped: true };
  }

  refreshing = true;
  let updated = 0;

  try {
    const now = Date.now();
    for (const [key, job] of refreshJobs) {
      if (now - job.lastAccess > STALE_JOB_MS) {
        refreshJobs.delete(key);
        continue;
      }

      try {
        const articles = await fetchRemoteArticles(buildQuery(job.topics), 'publishedAt');
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
  rememberArticle,
  refreshCachedNews,
  startPeriodicRefresh,
  stopPeriodicRefresh,
};
