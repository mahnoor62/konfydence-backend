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
    organizationName: {
      type: String,
      trim: true
    },
    department: {
      type: String,
      trim: true,
      comment: 'Department from demo request form'
    },
    position: {
      type: String,
      trim: true,
      comment: 'Position/Job title from demo request form'
    },
    address: {
      type: String,
      trim: true,
      comment: 'Street address from demo request form'
    },
    city: {
      type: String,
      trim: true,
      comment: 'City from demo request form'
    },
    state: {
      type: String,
      trim: true,
      comment: 'State/Province from demo request form'
    },
    country: {
      type: String,
      trim: true,
      comment: 'Country from demo request form'
    },
    phone: {
      type: String,
      trim: true,
      comment: 'Phone number from demo request form'
    },
    website: {
      type: String,
      trim: true,
      comment: 'Website URL from demo request form'
    },
    teamSize: {
      type: String,
      trim: true,
      comment: 'Team size from contact form (e.g., for CoMaSy demos)'
    },
    studentStaffSize: {
      type: String,
      trim: true,
      comment: 'Student/Staff size from education contact form (for B2E leads)'
    },
    message: {
      type: String,
      trim: true,
      comment: 'Original message from contact form (or latest for normal contact)'
    },
    // For normal contact topics: multiple messages per lead (email), admin sees all
    messages: [{
      topic: { type: String, trim: true },
      text: { type: String, trim: true },
      createdAt: { type: Date, default: Date.now }
    }],
    // When admin last viewed messages (for unread badge)
    messagesReadAt: {
      type: Date,
      comment: 'When admin last opened the messages dialog; used to show unread count'
    },
    topic: {
      type: String,
      trim: true,
      comment: 'Original topic selected in contact form (e.g., comasy, education-youth-pack, nis2-audit)'
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
    // Demo tracking with status
    demoStatus: {
      type: String,
      enum: ['none', 'requested', 'scheduled', 'completed', 'no_show'],
      default: 'none'
    },
    demoScheduledAt: {
      type: Date
    },
    demoCompletedAt: {
      type: Date
    },
    linkedTrialIds: [{
      type: Schema.Types.ObjectId,
      ref: 'FreeTrial'
    }],
    // Quote/Pricing with status
    quoteStatus: {
      type: String,
      enum: ['none', 'requested', 'sent', 'accepted', 'lost'],
      default: 'none'
    },
    quoteRequestedAt: {
      type: Date
    },
    quoteSentAt: {
      type: Date
    },
    quoteAcceptedAt: {
      type: Date
    },
    // Legacy fields for backward compatibility
    demoRequested: {
      type: Boolean,
      default: false
    },
    demoCompleted: {
      type: Boolean,
      default: false
    },
    quoteRequested: {
      type: Boolean,
      default: false
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
    // Engagement tracking - detailed interactions
    engagements: [{
      type: {
        type: String,
        enum: ['call', 'email', 'meeting', 'other'],
        required: true
      },
      summary: {
        type: String,
        required: true,
        trim: true
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
    // Timeline - auto-logged activities
    timeline: [{
      eventType: {
        type: String,
        enum: [
          'created',
          'status_changed',
          'demo_requested',
          'demo_scheduled',
          'demo_completed',
          'demo_no_show',
          'quote_requested',
          'quote_sent',
          'quote_accepted',
          'quote_lost',
          'note_added',
          'engagement_logged',
          'converted'
        ],
        required: true
      },
      description: {
        type: String,
        required: true
      },
      metadata: {
        type: Schema.Types.Mixed,
        default: {}
      },
      createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'Admin'
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    // Compliance tags for audit readiness
    complianceTags: [{
      type: String,
      enum: [
        'NIS2',
        'Security Awareness',
        'Human Risk',
        'Social Engineering',
        'Incident Response',
        'Management Training',
        'ISO 27001',
        'Awareness',
        'Leadership'
      ]
    }],
    // Engagement evidence for audit
    engagementEvidence: {
      type: String,
      trim: true,
      comment: 'Notes from workshops/sessions for audit purposes'
    },
    evidenceDate: {
      type: Date,
      comment: 'Date when evidence was documented'
    },
    facilitator: {
      type: String,
      trim: true,
      comment: 'Name of facilitator for sessions'
    },
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

