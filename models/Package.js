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
        default: 'EUR',
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
    maxSeats: {
      type: Number,
      default: 0,
      min: 1
    },
    expiryDate: {
      type: Date,
      comment: 'Package expiry date - when this package expires'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Package', PackageSchema);

