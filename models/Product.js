const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProductSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    type: {
      type: String,
      required: true
    },
    category: {
      type: String,
      enum: ['private-users', 'schools', 'businesses'],
    },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    imageUrl: { type: String, required: true },
    badges: [{ type: String }],
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', ProductSchema);
