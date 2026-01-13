const mongoose = require('mongoose');
const { Schema } = mongoose;

const ContactMessageSchema = new Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    company: { type: String },
    topic: {
      type: String,
      enum: [
        'b2b_demo',
        'b2c_question',
        'education',
        'other',
        'scam-survival-kit',
        'education-youth-pack',
        'comasy',
        'CoMaSi',
        'nis2-audit',
        'partnerships',
        'media-press',
        'demo-families',
        'demo-schools',
        'demo-businesses'
      ],
      required: true
    },
    message: { type: String, required: true },
    // Demo request additional fields
    department: { type: String },
    position: { type: String },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    phone: { type: String },
    website: { type: String },
    status: {
      type: String,
      enum: ['new', 'read', 'replied', 'closed'],
      default: 'new'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ContactMessage', ContactMessageSchema);
