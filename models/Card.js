const mongoose = require('mongoose');
const { Schema } = mongoose;

const CardSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    referenceCode: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      uppercase: true
    },
    category: {
      type: String,
      trim: true
    },
    visibility: {
      type: String,
      enum: ['public', 'internal', 'custom_only'],
      default: 'public'
    },
    targetAudiences: [{
      type: String,
      enum: ['B2C', 'B2B', 'B2E']
    }],
    tags: [{
      type: String,
      trim: true
    }],
    question: {
      description: {
        type: String,
        required: true,
        trim: true
      },
      answers: [{
        text: {
          type: String,
          required: true,
          trim: true
        },
        scoring: {
          type: Number,
          required: true,
          default: 0,
          min: 0
        }
      }],
      feedback: {
        type: String,
        trim: true
      },
      attachments: [{
        type: {
          type: String,
          enum: ['audio', 'video', 'pdf', 'word', 'link'],
          required: true
        },
        url: {
          type: String,
          required: true
        },
        title: {
          type: String,
          required: true
        }
      }]
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Card', CardSchema);

