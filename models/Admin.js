const mongoose = require('mongoose');
const { Schema } = mongoose;

const AdminSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    name: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastLogin: {
      type: Date
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Admin', AdminSchema);
