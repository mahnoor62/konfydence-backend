const mongoose = require('mongoose');
const { Schema } = mongoose;

const CustomPackageRequestSchema = new Schema(
  {
    basePackageId: {
      type: Schema.Types.ObjectId,
      ref: 'Package',
      required: true
    },
    organizationName: {
      type: String,
      required: true,
      trim: true
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
          default: 'EUR',
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

