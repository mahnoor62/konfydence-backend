const mongoose = require('mongoose');
const { Schema } = mongoose;

const OrgUserSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    assignedCustomPackageIds: [{
      type: Schema.Types.ObjectId,
      ref: 'CustomPackage'
    }],
    segment: {
      type: String,
      enum: ['B2B', 'B2E'],
      required: true
    },
    progress: {
      cardProgress: [{
        cardId: {
          type: Schema.Types.ObjectId,
          ref: 'Card'
        },
        completed: {
          type: Boolean,
          default: false
        },
        completedAt: {
          type: Date
        },
        progressPercentage: {
          type: Number,
          default: 0,
          min: 0,
          max: 100
        }
      }],
      packageProgress: [{
        packageId: {
          type: Schema.Types.ObjectId,
          ref: 'CustomPackage'
        },
        completedCards: {
          type: Number,
          default: 0
        },
        totalCards: {
          type: Number,
          default: 0
        },
        completionPercentage: {
          type: Number,
          default: 0,
          min: 0,
          max: 100
        }
      }]
    }
  },
  { timestamps: true }
);

OrgUserSchema.index({ userId: 1, organizationId: 1 }, { unique: true });

module.exports = mongoose.model('OrgUser', OrgUserSchema);

