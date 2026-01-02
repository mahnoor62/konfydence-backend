const mongoose = require('mongoose');
const { Schema } = mongoose;

const FreeTrialSchema = new Schema(
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
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
    },
    uniqueCode: {
      type: String,
      required: true,
      unique: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: true,
    },
    maxSeats: {
      type: Number,
      default: 2,
    },
    usedSeats: {
      type: Number,
      default: 0,
    },
    codeApplications: {
      type: Number,
      default: 0,
      comment: 'Number of times code was verified/applied'
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'completed'],
      default: 'active',
    },
    targetAudience: {
      type: String,
      enum: ['B2C', 'B2B', 'B2E'],
      index: true,
      comment: 'Target audience for this demo/trial (B2C, B2B, or B2E)'
    },
    cardQuantity: {
      type: Number,
      comment: 'Number of cards available in this demo (30 for B2C, 90 for B2B/B2E)'
    },
    isDemo: {
      type: Boolean,
      default: false,
      index: true,
      comment: 'True if this is a demo user (created via demo request), false if purchased user'
    },
    referrals: [
      {
        referredUserId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        usedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    gamePlays: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        playedAt: {
          type: Date,
          default: Date.now,
        },
        level: {
          type: Number,
        },
      },
    ],
  },
  { timestamps: true }
);

// Index for faster lookups
FreeTrialSchema.index({ uniqueCode: 1 });
FreeTrialSchema.index({ userId: 1 });
FreeTrialSchema.index({ status: 1 });

module.exports = mongoose.model('FreeTrial', FreeTrialSchema);

