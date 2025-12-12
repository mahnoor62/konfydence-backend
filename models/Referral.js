const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReferralSchema = new Schema(
  {
    referrerUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    referredUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    referralCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'expired'],
      default: 'pending'
    },
    referrerRewardGranted: {
      type: Boolean,
      default: false
    },
    referredRewardGranted: {
      type: Boolean,
      default: false
    },
    freeAccessMonths: {
      type: Number,
      default: 1
    },
    referrerAccessExpiresAt: {
      type: Date
    },
    referredAccessExpiresAt: {
      type: Date
    }
  },
  { timestamps: true }
);

// Generate referral code helper
function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

ReferralSchema.pre('save', function(next) {
  if (this.isNew && !this.referralCode) {
    this.referralCode = generateReferralCode();
  }
  next();
});

module.exports = mongoose.model('Referral', ReferralSchema);

