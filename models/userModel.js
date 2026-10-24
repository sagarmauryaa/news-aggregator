const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
    },
    preferences: {
      type: [String],
      default: [],
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

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
