if (
    typeof process.env.JWT_SECRET !== 'string'
    || process.env.JWT_SECRET.length < 32
    || process.env.JWT_SECRET === 'dev-secret'
) {
    process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';
}

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

tap.before(async () => {
    await app.dbReady;
    const mongoose = require('mongoose');
    const name = mongoose.connection.name || '';
    if (!/test/i.test(name) || name === 'news-aggregator') {
        throw new Error(`Refusing to delete users from database "${name}"`);
    }
    const User = require('../models/userModel');
    await User.deleteMany({});
});

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

    const longPassword = await server.post('/users/signup').send({
        name: mockUser.name,
        email: 'long-password@example.com',
        password: 'a'.repeat(73)
    });
    t.equal(longPassword.status, 400);
    t.ok(longPassword.body.errors.some((error) => error.field === 'password' && /72 bytes/.test(error.message)));

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

tap.test('signup stores a normalized email and login accepts that email', async (t) => {
    const created = await server.post('/users/signup').send({
        name: 'Lois Lane',
        email: 'Lois@DailyPlanet.com',
        password: mockUser.password
    });
    t.equal(created.status, 200);
    t.equal(created.body.user.email, 'lois@dailyplanet.com');

    const loggedIn = await server.post('/users/login').send({
        email: 'lois@dailyplanet.com',
        password: mockUser.password
    });
    t.equal(loggedIn.status, 200);
    t.hasOwnProp(loggedIn.body, 'token');
    t.end();
});

tap.test('POST /register, POST /login, and GET /preferences', async (t) => {
    const created = await server.post('/register').send({
        name: 'Bruce Wayne',
        email: 'bruce@wayne.com',
        password: mockUser.password,
        preferences: ['movies']
    });
    t.equal(created.status, 200);

    const loggedIn = await server.post('/login').send({
        email: 'bruce@wayne.com',
        password: mockUser.password
    });
    t.equal(loggedIn.status, 200);

    const prefs = await server.get('/preferences').set('Authorization', `Bearer ${loggedIn.body.token}`);
    t.equal(prefs.status, 200);
    t.same(prefs.body.preferences, ['movies']);
    t.end();
});

tap.test('POST /signup is not published at the server root', async (t) => {
    const response = await server.post('/signup').send({
        name: 'Nobody',
        email: 'nobody@example.com',
        password: mockUser.password
    });
    t.equal(response.status, 404);
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

tap.test('tokens signed with the removed dev-secret are rejected', async (t) => {
    const jwt = require('jsonwebtoken');
    const payload = jwt.decode(token);
    const forged = jwt.sign({ userId: payload.userId }, 'dev-secret');
    const response = await server.get('/users/preferences').set('Authorization', `Bearer ${forged}`);
    t.equal(response.status, 401);
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

    const wrongObject = await server.put('/users/preferences').set('Authorization', `Bearer ${token}`).send({
        preferences: { wrong: 'wrong' }
    });
    t.equal(wrongObject.status, 400);

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

tap.test('GET /news rejects a preference the user has not saved', async (t) => {
    const response = await server.get('/news').set('Authorization', `Bearer ${token}`).query({ preferences: 'wrong' });
    t.equal(response.status, 400);
    t.end();
});

tap.test('GET /news accepts a saved preference', async (t) => {
    const response = await server.get('/news').set('Authorization', `Bearer ${token}`).query({ preferences: 'movies' });
    t.equal(response.status, 200);
    t.hasOwnProp(response.body, 'news');
    t.end();
});

tap.test('request logs omit the query string', async (t) => {
    const lines = [];
    const original = console.log;
    console.log = (line) => {
        lines.push(String(line));
    };

    try {
        await server.get('/news').query({ token: 'secret-value' });
    } finally {
        console.log = original;
    }

    const requestLine = lines.find((line) => line.includes('GET /news'));
    t.ok(requestLine);
    t.notMatch(requestLine, /secret-value/);
    t.notMatch(requestLine, /\?/);
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
    const response = await server
        .post('/news/0123456789abcdef/read')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Fabricated article', url: 'https://example.com/fake' });
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

tap.test('news fetch fails when NewsAPI is unreachable', async (t) => {
    const newsService = require('../services/newsService');
    const previous = process.env.NEWS_API_BASE_URL;
    process.env.NEWS_API_BASE_URL = 'http://127.0.0.1:9/v2/everything';

    try {
        await newsService.fetchNewsForPreferences(['unreachable-check']);
        t.fail('expected the provider failure to propagate');
    } catch (err) {
        t.ok(err.status >= 500);
        t.match(err.message, /news|provider|configured/i);
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
    const { disconnectDB } = require('../config/db');
    await disconnectDB();
});