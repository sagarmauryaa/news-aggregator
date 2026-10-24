const tap = require('tap');
const supertest = require('supertest');
const app = require('../app');
const server = supertest(app);

const mockUser = {
    name: 'Clark Kent',
    email: 'clark@superman.com',
    password: 'Krypt()n8',
    preferences:['movies', 'comics']
};

let token = '';

// Auth tests

tap.test('POST /users/signup', async (t) => { 
    const response = await server.post('/users/signup').send(mockUser);
    t.equal(response.status, 200);
    t.end();
});

tap.test('POST /users/signup with missing email', async (t) => {
    const response = await server.post('/users/signup').send({
        name: mockUser.name,
        password: mockUser.password
    });
    t.equal(response.status, 400);
    t.equal(response.body.message, 'Validation failed');
    t.ok(response.body.errors.some((error) => error.field === 'email'));
    t.end();
});

tap.test('POST /users/signup rejects invalid email, short password, and bad preference types', async (t) => {
    const invalidEmail = await server.post('/users/signup').send({
        name: mockUser.name,
        email: 'not-an-email',
        password: mockUser.password
    });
    t.equal(invalidEmail.status, 400);
    t.ok(invalidEmail.body.errors.some((error) => error.field === 'email' && /email/i.test(error.message)));

    const shortPassword = await server.post('/users/signup').send({
        name: mockUser.name,
        email: 'short-password@example.com',
        password: 'abc'
    });
    t.equal(shortPassword.status, 400);
    t.ok(shortPassword.body.errors.some((error) => error.field === 'password'));

    const badPreferences = await server.post('/users/signup').send({
        name: mockUser.name,
        email: 'prefs@example.com',
        password: mockUser.password,
        preferences: 'movies'
    });
    t.equal(badPreferences.status, 400);
    t.ok(badPreferences.body.errors.some((error) => error.field === 'preferences'));

    const numericPreference = await server.post('/users/signup').send({
        name: mockUser.name,
        email: 'prefs@example.com',
        password: mockUser.password,
        preferences: [1]
    });
    t.equal(numericPreference.status, 400);
    t.ok(numericPreference.body.errors.some((error) => error.field === 'preferences.0'));
    t.end();
});

tap.test('POST /users/signup rejects malformed JSON', async (t) => {
    const response = await server
        .post('/users/signup')
        .set('Content-Type', 'application/json')
        .send('{"name":');
    t.equal(response.status, 400);
    t.equal(response.body.message, 'Invalid JSON body');
    t.end();
});

tap.test('POST /users/login', async (t) => { 
    const response = await server.post('/users/login').send({
        email: mockUser.email,
        password: mockUser.password
    });
    t.equal(response.status, 200);
    t.hasOwnProp(response.body, 'token');
    token = response.body.token;
    t.end();
});

tap.test('POST /users/login with wrong password', async (t) => {
    const response = await server.post('/users/login').send({
        email: mockUser.email,
        password: 'wrongpassword'
    });
    t.equal(response.status, 401);
    t.end();
});

tap.test('POST /users/login with missing password', async (t) => {
    const response = await server.post('/users/login').send({
        email: mockUser.email
    });
    t.equal(response.status, 400);
    t.ok(response.body.errors.some((error) => error.field === 'password'));
    t.end();
});

// Preferences tests

tap.test('GET /users/preferences', async (t) => {
    const response = await server.get('/users/preferences').set('Authorization', `Bearer ${token}`);
    t.equal(response.status, 200);
    t.hasOwnProp(response.body, 'preferences');
    t.same(response.body.preferences, mockUser.preferences);
    t.end();
});

tap.test('GET /users/preferences without token', async (t) => {
    const response = await server.get('/users/preferences');
    t.equal(response.status, 401);
    t.match(response.body.message, /Unauthorized/);
    t.end();
});

tap.test('GET /users/preferences with invalid token', async (t) => {
    const response = await server.get('/users/preferences').set('Authorization', 'Bearer not-a-token');
    t.equal(response.status, 401);
    t.equal(response.body.message, 'Unauthorized: invalid token');
    t.end();
});

tap.test('PUT /users/preferences', async (t) => {
    const response = await server.put('/users/preferences').set('Authorization', `Bearer ${token}`).send({
        preferences: ['movies', 'comics', 'games']
    });
    t.equal(response.status, 200);
});

tap.test('Check PUT /users/preferences', async (t) => {
    const response = await server.get('/users/preferences').set('Authorization', `Bearer ${token}`);
    t.equal(response.status, 200);
    t.same(response.body.preferences, ['movies', 'comics', 'games']);
    t.end();
});

tap.test('PUT /users/preferences rejects missing and invalid values', async (t) => {
    const missing = await server.put('/users/preferences').set('Authorization', `Bearer ${token}`).send({});
    t.equal(missing.status, 400);
    t.ok(missing.body.errors.some((error) => error.field === 'preferences'));

    const wrongType = await server.put('/users/preferences').set('Authorization', `Bearer ${token}`).send({
        preferences: 'movies'
    });
    t.equal(wrongType.status, 400);
    t.ok(wrongType.body.errors.some((error) => /array/i.test(error.message)));

    const blank = await server.put('/users/preferences').set('Authorization', `Bearer ${token}`).send({
        preferences: ['  ']
    });
    t.equal(blank.status, 400);
    t.ok(blank.body.errors.some((error) => error.field === 'preferences.0'));

    const unchanged = await server.get('/users/preferences').set('Authorization', `Bearer ${token}`);
    t.same(unchanged.body.preferences, ['movies', 'comics', 'games']);
    t.end();
});

// News tests

tap.test('GET /news', async (t) => {
    const response = await server.get('/news').set('Authorization', `Bearer ${token}`);
    t.equal(response.status, 200);
    t.hasOwnProp(response.body, 'news');
    t.end();
});

tap.test('GET /news without token', async (t) => {
    const response = await server.get('/news');
    t.equal(response.status, 401);
    t.end();
});

tap.test('GET /news with a non-bearer header', async (t) => {
    const response = await server.get('/news').set('Authorization', token);
    t.equal(response.status, 401);
    t.equal(response.body.message, 'Unauthorized: token required');
    t.end();
});

tap.test('GET /news/search/:keyword', async (t) => {
    const response = await server.get('/news/search/movies').set('Authorization', `Bearer ${token}`);
    t.equal(response.status, 200);
    t.hasOwnProp(response.body, 'news');
    t.ok(Array.isArray(response.body.news));
    t.end();
});

tap.test('GET /news/search/:keyword without token', async (t) => {
    const response = await server.get('/news/search/movies');
    t.equal(response.status, 401);
    t.end();
});

tap.test('POST /news/:id/read and GET /news/read', async (t) => {
    const list = await server.get('/news').set('Authorization', `Bearer ${token}`);
    t.equal(list.status, 200);
    t.ok(list.body.news.length > 0);

    const article = list.body.news[0];
    const marked = await server.post(`/news/${article.id}/read`).set('Authorization', `Bearer ${token}`);
    t.equal(marked.status, 200);
    t.equal(marked.body.article.id, article.id);

    const again = await server.post(`/news/${article.id}/read`).set('Authorization', `Bearer ${token}`);
    t.equal(again.status, 200);

    const read = await server.get('/news/read').set('Authorization', `Bearer ${token}`);
    t.equal(read.status, 200);
    t.equal(read.body.news.filter((item) => item.id === article.id).length, 1);
    t.end();
});

tap.test('POST /news/:id/favorite and GET /news/favorites', async (t) => {
    const list = await server.get('/news').set('Authorization', `Bearer ${token}`);
    const article = list.body.news[0];

    const marked = await server.post(`/news/${article.id}/favorite`).set('Authorization', `Bearer ${token}`);
    t.equal(marked.status, 200);
    t.equal(marked.body.message, 'Article marked as favorite');

    const favorites = await server.get('/news/favorites').set('Authorization', `Bearer ${token}`);
    t.equal(favorites.status, 200);
    t.ok(favorites.body.news.some((item) => item.id === article.id));
    t.end();
});

tap.test('POST /news/:id/read with unknown article', async (t) => {
    const response = await server.post('/news/0123456789abcdef/read').set('Authorization', `Bearer ${token}`);
    t.equal(response.status, 404);
    t.end();
});

tap.test('POST /news/:id/read with invalid id', async (t) => {
    const response = await server.post('/news/not-an-id/read').set('Authorization', `Bearer ${token}`);
    t.equal(response.status, 400);
    t.end();
});

tap.test('GET /news/read without token', async (t) => {
    const response = await server.get('/news/read');
    t.equal(response.status, 401);
    t.end();
});

tap.test('GET /news/favorites without token', async (t) => {
    const response = await server.get('/news/favorites');
    t.equal(response.status, 401);
    t.end();
});

tap.test('news fetch falls back when NewsAPI is unreachable', async (t) => {
    const newsService = require('../services/newsService');
    const previous = process.env.NEWS_API_BASE_URL;
    process.env.NEWS_API_BASE_URL = 'http://127.0.0.1:9/v2/everything';

    try {
        const news = await newsService.fetchNewsForPreferences(['unreachable-check']);
        t.equal(news.length, 1);
        t.equal(news[0].source, 'fallback');
        t.match(news[0].description, /failed/i);
    } finally {
        if (previous === undefined) {
            delete process.env.NEWS_API_BASE_URL;
        } else {
            process.env.NEWS_API_BASE_URL = previous;
        }
    }

    t.end();
});

tap.test('preference feed is served from cache until a refresh', async (t) => {
    const newsService = require('../services/newsService');
    const first = await newsService.fetchNewsForPreferences(['cache-check']);
    const second = await newsService.fetchNewsForPreferences(['cache-check']);
    t.same(second, first);

    const result = await newsService.refreshCachedNews();
    t.ok(result.updated >= 1);

    const third = await newsService.fetchNewsForPreferences(['cache-check']);
    t.ok(Array.isArray(third));
    t.ok(third.length > 0);
    t.end();
});

tap.teardown(async () => {
    const { stopPeriodicRefresh } = require('../services/newsService');
    stopPeriodicRefresh();
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
    }
});