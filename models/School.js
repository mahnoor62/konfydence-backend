const mongoose = require('mongoose');
const { Schema } = mongoose;
const crypto = require('crypto');

const SchoolSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['school', 'govt', 'other'],
      required: true
    },
    customType: {
      type: String,
      trim: true
    },
    uniqueCode: {
      type: String,
      unique: true,
      sparse: true
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
    // Track students linked to this school (similar to Organization.members)
    students: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    // Track transactions (package purchases) for this school
    transactionIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Transaction'
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
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

// Generate unique code before saving
SchoolSchema.pre('save', async function(next) {
  if (!this.uniqueCode) {
    let code;
    let isUnique = false;
    const School = this.constructor;
    while (!isUnique) {
      code = 'SCH-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const existing = await School.findOne({ uniqueCode: code });
      if (!existing) {
        isUnique = true;
      }
    }
    this.uniqueCode = code;
  }
  next();
});

module.exports = mongoose.model('School', SchoolSchema);

