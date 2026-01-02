const mongoose = require('mongoose');
const { Schema } = mongoose;

const DemoSchema = new Schema(
  {
    targetAudience: {
      type: String,
      enum: ['B2C', 'B2B', 'B2E'],
      required: true,
      index: true,
    },
    duration: {
      type: Number,
      required: true,
      default: 14, // 14 days
      comment: 'Demo duration in days'
    },
    seats: {
      type: Number,
      required: true,
      default: 2,
      comment: 'Number of seats available in demo'
    },
    cardQuantity: {
      type: Number,
      required: true,
      comment: 'Number of cards available in demo (30 for B2C, 90 for B2B/B2E)'
    },
    name: {
      type: String,
      required: true,
      trim: true,
      comment: 'Demo name (e.g., "B2C Demo", "B2B Demo")'
    },
    description: {
      type: String,
      default: '',
      comment: 'Demo description'
    },
    isActive: {
      type: Boolean,
      default: true,
      comment: 'Whether this demo configuration is active'
    },
    isPredefined: {
      type: Boolean,
      default: true,
      comment: 'Predefined demos cannot be deleted'
    }
  },
  { timestamps: true }
);

// Index for faster lookups
DemoSchema.index({ targetAudience: 1, isActive: 1 });

module.exports = mongoose.model('Demo', DemoSchema);


