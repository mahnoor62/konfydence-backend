const mongoose = require('mongoose');
const { Schema } = mongoose;

const PackageSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['standard', 'digital', 'physical', 'digital_physical', 'renewal'],
      default: 'standard'
    },
    packageType: {
      type: String,
      enum: ['digital', 'physical', 'digital_physical', 'renewal', 'standard'],
      default: 'standard'
    },
    category: {
      type: String,
      enum: ['digital', 'physical', 'digital_physical', 'renewal', 'standard'],
      default: 'standard'
    },
    includedCardIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Card'
    }],
    pricing: {
      amount: {
        type: Number,
        required: true
      },
      currency: {
        type: String,
        default: 'USD',
        uppercase: true
      },
      billingType: {
        type: String,
        enum: ['one_time', 'subscription', 'per_seat'],
        required: true
      }
    },
    targetAudiences: [{
      type: String,
      enum: ['B2C', 'B2B', 'B2E'],
      required: true
    }],
    visibility: {
      type: String,
      enum: ['public', 'hidden'],
      default: 'public'
    },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active'
    },
    isPredefined: {
      type: Boolean,
      default: false,
      comment: 'If true, this is a predefined package that cannot be deleted'
    },
    maxSeats: {
      type: Number,
      default: 0,
      min: 0  // Allow 0 for physical packages
    },
    expiryTime: {
      type: Number,
      default: null,
      min: 0,
      comment: 'Package expiry duration (number of units)'
    },
    expiryTimeUnit: {
      type: String,
      enum: ['months', 'years'],
      default: null,
      comment: 'Package expiry time unit (months or years)'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Package', PackageSchema);

