const mongoose = require('mongoose');
const { Schema } = mongoose;

const TransactionSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['b2c_purchase', 'b2c_renewal', 'b2b_contract', 'b2e_contract'],
      required: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization'
    },
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School'
    },
    packageId: {
      type: Schema.Types.ObjectId,
      ref: 'Package'
    },
    packageType: {
      type: String,
      enum: ['standard', 'digital', 'physical', 'digital_physical', 'renewal', 'custom']
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product'
    },
    customPackageId: {
      type: Schema.Types.ObjectId,
      ref: 'CustomPackage'
    },
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    status: {
      type: String,
      enum: ['paid', 'pending', 'failed', 'refunded'],
      default: 'pending'
    },
    // paymentProvider: {
    //   type: String
    // },
    providerRef: {
      type: String
    },
    uniqueCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    stripePaymentIntentId: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    webhookData: {
      type: Schema.Types.Mixed,
      default: null
    },
    webhookEventType: {
      type: String,
      default: null
    },
    webhookReceivedAt: {
      type: Date,
      default: null
    },
    contractPeriod: {
      startDate: {
        type: Date
      },
      endDate: {
        type: Date
      }
    },
    // Game access tracking (similar to FreeTrial)
    maxSeats: {
      type: Number,
      default: 5 // For purchases, default to 5 seats per transaction
    },
    usedSeats: {
      type: Number,
      default: 0
    },
    codeApplications: {
      type: Number,
      default: 0
    },
    gamePlays: [{
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      playedAt: {
        type: Date,
        default: Date.now
      }
    }],
    referrals: [{
      referredUserId: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      usedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', TransactionSchema);

