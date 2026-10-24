const mongoose = require('mongoose');

let ephemeralTestDatabase = false;

function databaseName(uri) {
  const withoutQuery = String(uri).split('?')[0];
  const slash = withoutQuery.lastIndexOf('/');
  if (slash === -1 || slash === withoutQuery.length - 1) {
    return '';
  }

  return decodeURIComponent(withoutQuery.slice(slash + 1));
}

function assertIsolatedTestDatabase(uri) {
  const name = databaseName(uri);
  if (!name || !/test/i.test(name) || name === 'news-aggregator') {
    throw new Error(`Refusing to run tests against database "${name || uri}"`);
  }

  return name;
}

function resolveMongoUri() {
  if (process.env.TAP) {
    const uri = process.env.TEST_MONGODB_URI
      || `mongodb://127.0.0.1:27017/news-aggregator-test-${process.pid}`;
    assertIsolatedTestDatabase(uri);
    ephemeralTestDatabase = !process.env.TEST_MONGODB_URI;
    return uri;
  }

  ephemeralTestDatabase = false;
  return process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/news-aggregator';
}

async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(resolveMongoUri());
  console.log('Connected to MongoDB');
}

async function disconnectDB() {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  const name = mongoose.connection.name;
  if (ephemeralTestDatabase && typeof name === 'string' && name.startsWith('news-aggregator-test-')) {
    await mongoose.connection.dropDatabase();
  }

  await mongoose.connection.close();
}

module.exports = connectDB;
module.exports.disconnectDB = disconnectDB;
