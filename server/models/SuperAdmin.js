const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const superAdminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    role: {
      type: String,
      default: 'SUPER_ADMIN',
      enum: ['SUPER_ADMIN'],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compare candidate password with stored hash
superAdminSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash || !candidatePassword) return false;
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

// Static helper to hash password
superAdminSchema.statics.hashPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(plainPassword, salt);
};

module.exports = mongoose.model('SuperAdmin', superAdminSchema);
