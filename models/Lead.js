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
    // Engagement tracking
    engagementCount: {
      type: Number,
      default: 0,
      comment: 'Number of interactions/engagements'
    },
    lastContactedAt: {
      type: Date,
      comment: 'Last time lead was contacted'
    },
    // Demo tracking
    demoRequested: {
      type: Boolean,
      default: false
    },
    demoCompleted: {
      type: Boolean,
      default: false
    },
    linkedTrialIds: [{
      type: Schema.Types.ObjectId,
      ref: 'FreeTrial'
    }],
    // Quote/Pricing
    quoteRequested: {
      type: Boolean,
      default: false
    },
    quoteRequestedAt: {
      type: Date
    },
    // Decision maker info
    isDecisionMaker: {
      type: Boolean,
      default: false
    },
    jobTitle: {
      type: String,
      trim: true
    },
    // Urgency
    hasUrgentNeed: {
      type: Boolean,
      default: false
    },
    urgentNeedDescription: {
      type: String,
      trim: true
    },
    // Notes and internal discussion
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
    // Conversion tracking
    convertedOrganizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization'
    },
    convertedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

// Auto-calculate status based on indicators
LeadSchema.methods.calculateStatus = function() {
  // If already converted or lost, don't change
  if (this.status === 'converted' || this.status === 'lost') {
    return this.status;
  }

  // HOT Lead indicators (any of these makes it hot):
  // - Requested demo AND completed it
  // - Asked for quote/pricing
  // - Engaged multiple times (3+)
  // - Has urgent need
  // - Decision maker is involved
  const isHot = 
    (this.demoRequested && this.demoCompleted) ||
    this.quoteRequested ||
    this.engagementCount >= 3 ||
    this.hasUrgentNeed ||
    this.isDecisionMaker;

  // WARM Lead indicators:
  // - Demo requested but not completed
  // - Has been contacted (lastContactedAt exists)
  // - Has notes/discussion (admin has interacted)
  // - Engagement count > 0 (but not enough for hot)
  const isWarm = 
    (this.demoRequested && !this.demoCompleted) ||
    this.lastContactedAt ||
    (this.notes && this.notes.length > 0) ||
    (this.engagementCount > 0 && this.engagementCount < 3);

  if (isHot) {
    return 'hot';
  } else if (isWarm) {
    return 'warm';
  } else {
    return 'new';
  }
};

// Index for faster queries
LeadSchema.index({ email: 1 });
LeadSchema.index({ status: 1 });
LeadSchema.index({ segment: 1 });
LeadSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Lead', LeadSchema);

