const mongoose = require('mongoose');
const { Schema } = mongoose;

const ContactMessageSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    company: { type: String },
    topic: {
      type: String,
      enum: ['b2b_demo', 'b2c_question', 'education', 'other'],
      required: true
    },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ['new', 'read', 'replied', 'closed'],
      default: 'new'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ContactMessage', ContactMessageSchema);
