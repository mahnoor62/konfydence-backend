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
    // Required fields from form
    imageUrl: { type: String, required: true },
    title: { type: String, required: true },
    price: { type: Number, required: true },
    targetAudience: [{
      type: String,
      enum: ['private-users', 'schools', 'businesses']
    }],
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
      required: true
    },
    
    // Optional/backward compatibility fields (will be set to defaults if not provided)
    name: { type: String, default: 'Product' },
    slug: { type: String, unique: true, sparse: true },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    
    // Allowed organizations/institutes for private products (only used if visibility is private)
    allowedOrganizations: [{
      type: Schema.Types.ObjectId,
      ref: 'Organization'
    }],
    allowedInstitutes: [{
      type: Schema.Types.ObjectId,
      ref: 'School'
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
