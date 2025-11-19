const mongoose = require('mongoose');
const { Schema } = mongoose;

const TestimonialSchema = new Schema(
  {
    name: { type: String, required: true },
    role: { type: String, required: true },
    organization: { type: String, required: true },
    quote: { type: String, required: true },
    segment: {
      type: String,
      enum: ['b2b', 'b2c', 'b2e'],
      required: true
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Testimonial', TestimonialSchema);
