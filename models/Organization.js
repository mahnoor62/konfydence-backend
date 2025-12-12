const mongoose = require('mongoose');
const { Schema } = mongoose;

const OrganizationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['company', 'bank', 'school', 'govt', 'other'],
      required: true
    },
    segment: {
      type: String,
      enum: ['B2B', 'B2E'],
      required: true
    },
    primaryContact: {
      name: {
        type: String,
        required: true
      },
      email: {
        type: String,
        required: true,
        lowercase: true
      },
      phone: {
        type: String
      },
      jobTitle: {
        type: String
      }
    },
    additionalContacts: [{
      name: {
        type: String,
        required: true
      },
      email: {
        type: String,
        required: true,
        lowercase: true
      },
      phone: {
        type: String
      },
      jobTitle: {
        type: String
      }
    }],
    customPackages: [{
      type: Schema.Types.ObjectId,
      ref: 'CustomPackage'
    }],
    seatUsage: {
      seatLimit: {
        type: Number,
        default: 0
      },
      usedSeats: {
        type: Number,
        default: 0
      }
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'prospect'],
      default: 'prospect'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Organization', OrganizationSchema);

