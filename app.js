require('dotenv').config({ quiet: true });

const express = require('express');
const connectDB = require('./config/db');
const usersRouter = require('./routes/users');
const newsRouter = require('./routes/news');
const { startPeriodicRefresh } = require('./services/newsService');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const port = process.env.PORT || 3000;

const dbReady = connectDB().catch((err) => {
  console.error('MongoDB connection failed:', err.message);
  if (require.main === module) {
    process.exit(1);
  }
  throw err;
});

app.use(express.json());

// Tests call the app while MongoDB is still connecting.
app.use((req, res, next) => {
  dbReady.then(() => next()).catch(next);
});

app.use('/users', usersRouter);
app.use('/news', newsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  dbReady.then(() => {
    app.listen(port, () => {
      console.log(`Server is listening on ${port}`);
      startPeriodicRefresh();
    }).on('error', (err) => {
      console.log('Something bad happened', err);
    });
  });
}

module.exports = app;
