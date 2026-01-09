const mongoose = require('mongoose');
const { Schema } = mongoose;

const CustomPackageSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization'
    },
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School'
    },
    entityType: {
      type: String,
      enum: ['organization', 'institute']
    },
    basePackageId: {
      type: Schema.Types.ObjectId,
      ref: 'Package',
      required: false
    },
    productIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Product'
    }],
    name: {
      type: String,
      trim: true
    },
    description: {
      type: String
    },
    addedCardIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Card'
    }],
    contractPricing: {
      amount: {
        type: Number,
        required: true
      },
      currency: {
        type: String,
        default: 'USD',
        uppercase: true
      },
      billingType: {
        type: String,
        enum: ['one_time', 'subscription', 'per_seat'],
        required: true
      },
      notes: {
        type: String
      }
    },
    seatLimit: {
      type: Number,
      required: true
    },
    contract: {
      startDate: {
        type: Date,
        required: true
      },
      endDate: {
        type: Date,
        required: false
      },
      status: {
        type: String,
        enum: ['active', 'expired', 'pending'],
        default: 'pending'
      }
    },
    expiryTime: {
      type: Number
    },
    expiryTimeUnit: {
      type: String,
      enum: ['months', 'years']
    },
    assignedCohorts: [{
      type: String,
      trim: true
    }],
    assignedUserIds: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    status: {
      type: String,
      enum: ['active', 'archived', 'pending'],
      default: 'pending'
    }
  },
  { timestamps: true }
);


module.exports = mongoose.model('CustomPackage', CustomPackageSchema);

