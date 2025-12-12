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
    levels: [{
      levelNumber: {
        type: Number,
        required: true,
        min: 1,
        max: 3
      },
      questions: [{
        title: {
          type: String,
          required: true,
          trim: true
        },
        description: {
          type: String,
          required: true,
          trim: true
        },
        category: {
          type: String,
          trim: true
        },
        tags: [{
          type: String,
          trim: true
        }],
        targetAudiences: [{
          type: String,
          enum: ['B2C', 'B2B', 'B2E']
        }],
        visibility: {
          type: String,
          enum: ['public', 'internal', 'custom_only'],
          default: 'public'
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
      }]
    }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Card', CardSchema);

