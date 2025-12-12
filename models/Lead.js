const mongoose = require('mongoose');
const { Schema } = mongoose;

const LeadSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    organizationName: {
      type: String,
      trim: true
    },
    segment: {
      type: String,
      enum: ['B2B', 'B2E', 'other'],
      required: true
    },
    source: {
      type: String,
      enum: ['b2b_form', 'b2e_form', 'contact_form', 'manual'],
      required: true
    },
    status: {
      type: String,
      enum: ['new', 'warm', 'hot', 'converted', 'lost'],
      default: 'new'
    },
    notes: [{
      text: {
        type: String,
        required: true
      },
      createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    // linkedDemoIds removed - Demo model no longer used
    // linkedDemoIds: [{
    //   type: Schema.Types.ObjectId,
    //   ref: 'Demo'
    // }],
    convertedOrganizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lead', LeadSchema);

