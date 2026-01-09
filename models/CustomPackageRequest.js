const mongoose = require('mongoose');
const { Schema } = mongoose;

const CustomPackageRequestSchema = new Schema(
  {
    basePackageId: {
      type: Schema.Types.ObjectId,
      ref: 'Package',
      required: false
    },
    entityType: {
      type: String,
      enum: ['organization', 'institute'],
      required: false
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product'
    },
    productIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Product'
    }],
    organizationName: {
      type: String,
      required: true,
      trim: true
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization'
    },
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School'
    },
    contactName: {
      type: String,
      required: true,
      trim: true
    },
    contactEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    contactPhone: {
      type: String,
      trim: true
    },
    requestedModifications: {
      cardsToAdd: [{
        type: Schema.Types.ObjectId,
        ref: 'Card'
      }],
      cardsToRemove: [{
        type: Schema.Types.ObjectId,
        ref: 'Card'
      }],
      customPricing: {
        amount: Number,
        currency: {
          type: String,
          default: 'USD',
          uppercase: true
        },
        billingType: {
          type: String,
          enum: ['one_time', 'subscription', 'per_seat']
        },
        notes: String
      },
      seatLimit: Number,
      contractDuration: {
        startDate: Date,
        endDate: Date
      },
      additionalNotes: String
    },
    status: {
      type: String,
      enum: ['pending', 'reviewing', 'approved', 'rejected', 'completed'],
      default: 'pending'
    },
    adminNotes: {
      type: String
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'Admin'
    },
    customPackageId: {
      type: Schema.Types.ObjectId,
      ref: 'CustomPackage'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('CustomPackageRequest', CustomPackageRequestSchema);

