const mongoose = require('mongoose');
const { Schema } = mongoose;

const NewsletterSchema = new Schema(
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
      default: 'general',
      index: true,
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
NewsletterSchema.index({ email: 1, subscriptionType: 1 }, { unique: true });

module.exports = mongoose.models.Newsletter || mongoose.model('Newsletter', NewsletterSchema);

