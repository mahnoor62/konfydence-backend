const mongoose = require('mongoose');
const { Schema } = mongoose;

const TrialSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
    },
    packageId: {
      type: Schema.Types.ObjectId,
      ref: 'Package',
    },
    uniqueCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    seats: {
      type: Number,
      default: 2,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'converted'],
      default: 'active',
    },
    playCount: {
      type: Number,
      default: 0,
    },
    maxPlays: {
      type: Number,
      default: 2, // 2 seats = 2 plays
    },
    referrals: [
      {
        referredUserId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        playedAt: {
          type: Date,
          default: Date.now,
        },
        sessionId: {
          type: String,
        },
      },
    ],
  },
  { timestamps: true }
);

// Index for faster lookups
TrialSchema.index({ uniqueCode: 1 });
TrialSchema.index({ userId: 1 });
TrialSchema.index({ status: 1 });

module.exports = mongoose.model('Trial', TrialSchema);

