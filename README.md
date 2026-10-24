# News Aggregator API

A REST API for signing up, saving news topics, and reading a personalized feed. Articles come from [NewsAPI](https://newsapi.org/). Preference feeds are cached in memory and refreshed on a timer. Read and favorite articles are stored on the user in MongoDB.

## Requirements

- Node.js 18 or newer
- MongoDB running locally, or a reachable `MONGODB_URI`
- A NewsAPI key (`NEWS_API_KEY`)

## Installation

```bash
npm install
cp .env.example .env
```

On Windows PowerShell, copy the example env file with:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set at least `MONGODB_URI`, `JWT_SECRET`, and `NEWS_API_KEY`.

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/news-aggregator` |
| `JWT_SECRET` | Secret used to sign login tokens. Required, at least 32 characters | none |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `NEWS_API_KEY` | NewsAPI key sent as `X-Api-Key` | none |
| `NEWS_API_BASE_URL` | Override for the NewsAPI everything endpoint | `https://newsapi.org/v2/everything` |
| `CACHE_TTL_SECONDS` | How long a preference or search feed stays cached | `3600` |
| `ARTICLE_CACHE_TTL_SECONDS` | How long an article id can be marked read or favorite | `86400` |
| `CACHE_REFRESH_MS` | How often cached preference feeds are refreshed and expired entries are removed | `1800000` |
| `CACHE_MAX_FEEDS` | Maximum cached feeds. Oldest feeds are evicted after this | `100` |
| `CACHE_MAX_ARTICLES` | Maximum cached articles. Oldest articles are evicted after this | `1000` |

Start the server:

```bash
npm start
```

For restart-on-save during development:

```bash
npm run dev
```

The server listens on `http://localhost:3000` unless `PORT` is set.

## Authentication

Public routes are signup and login. Every `/news` route and both preference routes require:

```http
Authorization: Bearer <token>
```

The token is the `token` field returned by `POST /users/login` or `POST /login`. Passwords are hashed with bcrypt before they are stored. The password field is excluded from queries and is selected only when checking a login. Tokens are signed with `JWT_SECRET`; there is no built-in secret.

## API

Errors use this shape. `errors` is present only for validation failures.

```json
{
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Valid email is required" }
  ]
}
```

Unknown routes return `404` with `{ "message": "Route not found" }`. A malformed JSON body returns `400` with `{ "message": "Invalid JSON body" }`.

### Users

#### `POST /users/signup`

Creates a user. Preferences are optional.

```json
{
  "name": "Clark Kent",
  "email": "clark@superman.com",
  "password": "Krypt()n8",
  "preferences": ["movies", "comics"]
}
```

| Field | Rules |
| --- | --- |
| `name` | Required, at most 100 characters |
| `email` | Required, valid email |
| `password` | At least 6 characters and at most 72 bytes |
| `preferences` | Optional array of 1–20 non-empty strings, each at most 50 characters |

`200`

```json
{
  "message": "User created",
  "user": {
    "id": "…",
    "name": "Clark Kent",
    "email": "clark@superman.com",
    "preferences": ["movies", "comics"],
    "language": "en"
  }
}
```

`400` when validation fails or the email is already registered. Email is stored in lowercase, so `User@example.com` and `user@example.com` are the same account.

`POST /register` is the same operation without the `/users` prefix.

#### `POST /users/login`

```json
{
  "email": "clark@superman.com",
  "password": "Krypt()n8"
}
```

`200`

```json
{ "token": "<jwt>" }
```

`401` when the email or password is wrong. `400` when a field is missing.

`POST /login` is the same operation without the `/users` prefix.

#### `GET /users/preferences`

Requires a token.

`200`

```json
{ "preferences": ["movies", "comics"], "language": "en" }
```

#### `PUT /users/preferences`

Requires a token. Replaces the whole preference list.

```json
{ "preferences": ["movies", "comics", "games"] }
```

`200`

```json
{ "preferences": ["movies", "comics", "games"], "language": "en" }
```

`400` when `preferences` is missing, not an array, or contains an empty item.

`GET /preferences` and `PUT /preferences` are the same operations without the `/users` prefix.

An optional `language` field on signup and on preference updates selects the NewsAPI language. Allowed values are `ar`, `de`, `en`, `es`, `fr`, `he`, `it`, `nl`, `no`, `pt`, `ru`, `sv`, `ud`, and `zh`. The default is `en`.

### News

All news routes require a token. An article looks like this:

```json
{
  "id": "a1b2c3d4e5f67890",
  "title": "Article title",
  "description": "Summary or null",
  "url": "https://example.com/story",
  "source": "Publisher name",
  "publishedAt": "2026-10-24T12:00:00Z",
  "imageUrl": "https://example.com/image.jpg"
}
```

`id` is the first 16 hex characters of a SHA-256 hash of the article URL (or title when there is no URL).

#### `GET /news`

Returns up to 20 articles for the signed-in user's preferences, newest first, in the user's saved language (`en` by default). An empty preference list uses the query `general`. Multiple preferences are joined with `OR`.

`GET /news?preferences=movies` limits the feed to saved preferences named in the query. A preference the user has not saved, such as `preferences=wrong`, returns `400`.

`200`

```json
{ "news": [] }
```

If the provider cannot be reached, the API key is missing, or the provider returns an error, the response is `502` or `503`. Provider failures are not replaced with a fabricated article.

Repeated calls for the same preference set and language are served from the in-memory cache until `CACHE_TTL_SECONDS` elapses. Expired entries are removed on a timer, and the oldest entries are evicted once `CACHE_MAX_FEEDS` or `CACHE_MAX_ARTICLES` is reached. A background job refreshes recently used preference feeds every `CACHE_REFRESH_MS`.

#### `GET /news/search/:keyword`

Searches NewsAPI by keyword, sorted by relevancy. The keyword is required and must be at most 200 characters. Results are cached the same way as preference feeds.

`200`

```json
{ "news": [] }
```

`400` for an invalid keyword. `502` or `503` when the provider fails or the API key is missing. Search uses the user's saved language.

#### `POST /news/:id/read`

Marks a cached article as read for the current user. Fetch `GET /news` or `GET /news/search/:keyword` first so the id is known. Marking the same article again updates the stored copy and does not create a duplicate.

`id` must be 16 hexadecimal characters.

`200`

```json
{
  "message": "Article marked as read",
  "article": { "id": "a1b2c3d4e5f67890", "title": "Article title" }
}
```

`404` when that id is not in the article cache. `400` when the id format is invalid.

#### `POST /news/:id/favorite`

Same rules as mark-as-read. Stores the article on the user's favorites.

`200`

```json
{
  "message": "Article marked as favorite",
  "article": { "id": "a1b2c3d4e5f67890", "title": "Article title" }
}
```

#### `GET /news/read`

`200`

```json
{ "news": [] }
```

#### `GET /news/favorites`

`200`

```json
{ "news": [] }
```

## Testing

```bash
npm run test
```

Tests use Tap and Supertest. A test run does not connect to `MONGODB_URI` and does not delete users from the application database. Tap runs use `TEST_MONGODB_URI` when that variable names a database containing `test`; otherwise each run uses a fresh `news-aggregator-test-<pid>` database and drops it when the suite finishes. User cleanup runs in the test setup, and only after the connected database name is confirmed to be a test database.

NewsAPI calls during tests need a valid `NEWS_API_KEY`. A provider failure is returned as an error.

## Project layout

```text
app.js                     Express app and server startup
config/db.js               MongoDB connection
routes/                    Route definitions
controllers/               Request handlers
services/newsService.js    NewsAPI client, cache, and refresh job
models/userModel.js        User, read articles, and favorites
middleware/                Auth, Zod validation, and error handling
validators/schemas.js      Request schemas
test/server.test.js        API tests
```
