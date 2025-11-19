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
      enum: ['starter', 'bundle', 'membership'],
      required: true
    },
    isActive: { type: Boolean, default: true },
    imageUrl: { type: String, required: true },
    badges: [{ type: String }],
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', ProductSchema);
