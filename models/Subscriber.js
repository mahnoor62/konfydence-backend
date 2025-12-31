const mongoose = require('mongoose');
const { Schema } = mongoose;

const SubscriberSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    subscriptionType: {
      type: String,
      enum: ['latest-news', 'weekly-insights', 'general', 'waitlist'],
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['newsletter-form', 'insights-form', 'waitlist-form', 'early-access-form', 'other'],
      default: 'other',
    },
    subscribedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index for email + subscriptionType
// This allows same email to subscribe to multiple types
SubscriberSchema.index({ email: 1, subscriptionType: 1 }, { unique: true });

module.exports = mongoose.models.Subscriber || mongoose.model('Subscriber', SubscriberSchema);

