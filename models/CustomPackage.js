const mongoose = require('mongoose');
const { Schema } = mongoose;

const CustomPackageSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    basePackageId: {
      type: Schema.Types.ObjectId,
      ref: 'Package',
      required: true
    },
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
    removedCardIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Card'
    }],
    effectiveCardIds: [{
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
        default: 'EUR',
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
        required: true
      },
      status: {
        type: String,
        enum: ['active', 'expired', 'pending'],
        default: 'pending'
      }
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

CustomPackageSchema.pre('save', async function() {
  if (this.isModified('basePackageId') || this.isModified('addedCardIds') || this.isModified('removedCardIds')) {
    const Package = mongoose.model('Package');
    const basePackage = await Package.findById(this.basePackageId);
    if (basePackage) {
      const baseCardIds = basePackage.includedCardIds.map(id => id.toString());
      const addedCardIds = this.addedCardIds.map(id => id.toString());
      const removedCardIds = this.removedCardIds.map(id => id.toString());
      
      const effective = [...new Set([...baseCardIds, ...addedCardIds])]
        .filter(id => !removedCardIds.includes(id));
      
      this.effectiveCardIds = effective;
    }
  }
});

module.exports = mongoose.model('CustomPackage', CustomPackageSchema);

