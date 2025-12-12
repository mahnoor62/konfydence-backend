const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema(
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
    profilePhoto: {
      type: String,
      trim: true
    },
    role: {
      type: String,
      enum: ['admin', 'b2c_user', 'b2b_user', 'b2e_user'],
      default: 'b2c_user'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationToken: {
      type: String
    },
    emailVerificationExpiry: {
      type: Date
    },
    passwordResetToken: {
      type: String
    },
    passwordResetExpiry: {
      type: Date
    },
    lastLogin: {
      type: Date
    },
    memberships: [{
      packageId: {
        type: Schema.Types.ObjectId,
        ref: 'Package',
        required: true
      },
      membershipType: {
        type: String,
        enum: ['b2c', 'b2b', 'b2e'],
        default: 'b2c'
      },
      status: {
        type: String,
        enum: ['active', 'expired', 'cancelled'],
        default: 'active'
      },
      startDate: {
        type: Date,
        required: true
      },
      endDate: {
        type: Date
      }
    }],
    progress: {
      cardProgress: [{
        cardId: {
          type: Schema.Types.ObjectId,
          ref: 'Card'
        },
        packageId: {
          type: Schema.Types.ObjectId,
          ref: 'Package'
        },
        completed: {
          type: Boolean,
          default: false
        },
        completedAt: {
          type: Date
        },
        progressPercentage: {
          type: Number,
          default: 0,
          min: 0,
          max: 100
        }
      }],
      packageProgress: [{
        packageId: {
          type: Schema.Types.ObjectId,
          ref: 'Package'
        },
        completedCards: {
          type: Number,
          default: 0
        },
        totalCards: {
          type: Number,
          default: 0
        },
        completionPercentage: {
          type: Number,
          default: 0,
          min: 0,
          max: 100
        }
      }]
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
