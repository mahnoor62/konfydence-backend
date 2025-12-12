const mongoose = require('mongoose');
const { Schema } = mongoose;

const GameProgressSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    cardId: {
      type: Schema.Types.ObjectId,
      ref: 'Card',
      required: true,
      index: true
    },
    packageId: {
      type: Schema.Types.ObjectId,
      ref: 'Package',
      index: true
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      index: true
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      index: true
    },
    freeTrialId: {
      type: Schema.Types.ObjectId,
      ref: 'FreeTrial',
      index: true
    },
    levelNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 3
    },
    // Level summary only (no question details)
    totalScore: {
      type: Number,
      required: true,
      default: 0
    },
    maxScore: {
      type: Number,
      required: true
    },
    correctAnswers: {
      type: Number,
      required: true,
      default: 0
    },
    totalQuestions: {
      type: Number,
      required: true
    },
    percentageScore: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100
    },
    completedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Compound index for efficient queries
GameProgressSchema.index({ userId: 1, cardId: 1, levelNumber: 1 });
GameProgressSchema.index({ userId: 1, completedAt: -1 });
GameProgressSchema.index({ cardId: 1, levelNumber: 1, totalScore: -1 }); // For leaderboard

module.exports = mongoose.model('GameProgress', GameProgressSchema);

