const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProductSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    // Use Case / Type: Leadership, OnCall, Community, Starter, Bundle
    type: {
      type: String,
      enum: ['leadership', 'oncall', 'community', 'starter', 'bundle'],
      required: true
    },
    // Product Category: Membership, Template, Course, Guide, Toolkit, Digital Guide
    category: {
      type: String,
      enum: ['membership', 'template', 'course', 'guide', 'toolkit', 'digital-guide', 'private-users', 'schools', 'businesses'], // Keep old values for backward compatibility
    },
    // Target audience (B2C, B2B, B2E)
    targetAudience: {
      type: String,
      enum: ['private-users', 'schools', 'businesses'],
    },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    imageUrl: { type: String, required: true },
    // Trust Badges: GDPR-compliant, Safe checkout, Money-back guarantee
    badges: [{
      type: String,
      enum: ['gdpr-compliant', 'safe-checkout', 'money-back-guarantee']
    }],
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', ProductSchema);
