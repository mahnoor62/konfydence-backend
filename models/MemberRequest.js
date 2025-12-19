const mongoose = require('mongoose');
const { Schema } = mongoose;

const MemberRequestSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization'
    },
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School'
    },
    organizationCode: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedAt: {
      type: Date
    },
    rejectedAt: {
      type: Date
    },
    rejectionReason: {
      type: String
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('MemberRequest', MemberRequestSchema);

