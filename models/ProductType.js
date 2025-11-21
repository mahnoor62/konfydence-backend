const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProductTypeSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProductType', ProductTypeSchema);

