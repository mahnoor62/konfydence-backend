const mongoose = require('mongoose');
const { Schema } = mongoose;

const GameProgressSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    cardId: {
      type: Schema.Types.ObjectId,
      ref: 'Card',
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
    cards: [{
      cardId: {
        type: Schema.Types.ObjectId,
        ref: 'Card',
        required: true
      },
      cardTitle: {
        type: String
      },
      questions: [{
        questionNo: {
          type: Number,
          required: true
        },
        questionId: {
          type: String
        },
        questionText: {
          type: String
        },
        selectedAnswer: {
          type: String
        },
        correctAnswer: {
          type: String
        },
        isCorrect: {
          type: Boolean,
          default: false
        },
        points: {
          type: Number,
          default: 0
        },
        answeredAt: {
          type: Date,
          default: Date.now
        }
      }],
      cardTotalScore: {
        type: Number,
        default: 0
      },
      cardMaxScore: {
        type: Number,
        default: 0
      },
      cardCorrectAnswers: {
        type: Number,
        default: 0
      },
      cardTotalQuestions: {
        type: Number,
        default: 0
      },
      cardPercentageScore: {
        type: Number,
        default: 0
      }
    }],
    totalScore: {
      type: Number,
      default: 0
    },
    maxScore: {
      type: Number,
      default: 0
    },
    correctAnswers: {
      type: Number,
      default: 0
    },
    totalQuestions: {
      type: Number,
      default: 0
    },
    percentageScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    riskLevel: {
      type: String,
      enum: ['Confident', 'Cautious', 'Vulnerable'],
      default: null
    },
    completedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

// One entry per user per level
GameProgressSchema.index({ userId: 1, levelNumber: 1 }, { unique: true });
GameProgressSchema.index({ userId: 1, updatedAt: -1 });
GameProgressSchema.index({ userId: 1, levelNumber: 1, updatedAt: -1 });

const GameProgress = mongoose.model('GameProgress', GameProgressSchema);

// Drop old unique index on userId only if it exists (migration helper)
GameProgress.dropOldIndex = async function() {
  try {
    const collection = this.collection;
    const indexes = await collection.indexes();
    const oldIndex = indexes.find(idx => 
      idx.name === 'userId_1' && 
      Object.keys(idx.key).length === 1 &&
      idx.unique === true
    );
    if (oldIndex) {
      await collection.dropIndex('userId_1');
      console.log('✅ Dropped old userId_1 unique index');
      return true;
    }
  } catch (error) {
    // Index might not exist or already dropped, ignore
    if (error.code !== 27 && error.codeName !== 'IndexNotFound') {
      console.log('Note: Could not drop old index:', error.message);
    }
  }
  return false;
};

module.exports = GameProgress;

