const mongoose = require('mongoose');
const { Schema } = mongoose;

const CardRegistrationSchema = new Schema(
  {
    referenceCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    registeredAt: {
      type: Date,
      default: Date.now
    },
    source: {
      type: String,
      enum: ['etsy', 'direct', 'referral', 'other'],
      default: 'direct'
    },
    freeAccessMonths: {
      type: Number,
      default: 2
    },
    accessExpiresAt: {
      type: Date
    },
    isUsed: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

CardRegistrationSchema.pre('save', function(next) {
  if (this.isNew && this.source === 'etsy') {
    this.freeAccessMonths = 2;
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 2);
    this.accessExpiresAt = expiryDate;
  }
  next();
});

module.exports = mongoose.model('CardRegistration', CardRegistrationSchema);












