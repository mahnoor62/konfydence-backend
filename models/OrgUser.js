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
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient queries
OrgUserSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
OrgUserSchema.index({ organizationId: 1 });

module.exports = mongoose.model('OrgUser', OrgUserSchema);

