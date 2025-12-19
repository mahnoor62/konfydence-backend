const mongoose = require('mongoose');
const { Schema } = mongoose;

// Helper function to generate slug from name
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

const ProductSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true },
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
    // Visibility: public (show on website) or private (only for selected orgs/institutes)
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public'
    },
    // Allowed organizations for private products
    allowedOrganizations: [{
      type: Schema.Types.ObjectId,
      ref: 'Organization'
    }],
    // Allowed institutes for private products
    allowedInstitutes: [{
      type: Schema.Types.ObjectId,
      ref: 'School'
    }],
    // Trust Badges: GDPR-compliant, Safe checkout, Money-back guarantee
    badges: [{
      type: String,
      enum: ['gdpr-compliant', 'safe-checkout', 'money-back-guarantee']
    }],
    // Level-based card arrays (for target audience-based card selection)
    level1: [{
      type: Schema.Types.ObjectId,
      ref: 'Card'
    }],
    level2: [{
      type: Schema.Types.ObjectId,
      ref: 'Card'
    }],
    level3: [{
      type: Schema.Types.ObjectId,
      ref: 'Card'
    }],
    // Legacy: Attached cards for this product (kept for backward compatibility)
    cardIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Card'
    }]
  },
  { timestamps: true }
);

// Auto-generate slug before saving
ProductSchema.pre('save', function(next) {
  if (!this.slug && this.name) {
    let baseSlug = generateSlug(this.name);
    let slug = baseSlug;
    let counter = 1;
    
    // Check if slug already exists (async check will be done in route handler)
    this.slug = slug;
  }
  next();
});

module.exports = mongoose.model('Product', ProductSchema);
