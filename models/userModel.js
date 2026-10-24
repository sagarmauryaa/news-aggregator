const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  BCRYPT_MAX_BYTES,
  EMAIL_PATTERN,
  NEWS_LANGUAGES,
  isValidPreferences,
} = require('../validators/constants');

const articleSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: String,
    description: String,
    url: String,
    source: String,
    publishedAt: String,
    imageUrl: String,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_PATTERN, 'Valid email is required'],
    },
    password: {
      type: String,
      required: [
        function passwordRequired() {
          return this.isNew || this.isModified('password');
        },
        'Password is required',
      ],
      minlength: 6,
      select: false,
      validate: {
        validator(value) {
          return Buffer.byteLength(value, 'utf8') <= BCRYPT_MAX_BYTES;
        },
        message: 'Password must be at most 72 bytes',
      },
    },
    preferences: {
      type: [String],
      default: [],
      validate: {
        validator: isValidPreferences,
        message: 'Preferences must be an array of at most 20 non-empty strings',
      },
    },
    language: {
      type: String,
      enum: NEWS_LANGUAGES,
      default: 'en',
      lowercase: true,
      trim: true,
    },
    readArticles: {
      type: [articleSchema],
      default: [],
    },
    favoriteArticles: {
      type: [articleSchema],
      default: [],
    },
  },
  { timestamps: true }
);

function hidePassword(_doc, ret) {
  delete ret.password;
  return ret;
}

userSchema.set('toJSON', { transform: hidePassword });
userSchema.set('toObject', { transform: hidePassword });

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (typeof this.password !== 'string' || typeof candidate !== 'string') {
    return Promise.resolve(false);
  }

  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
