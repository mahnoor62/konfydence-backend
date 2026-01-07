const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const GameProgress = require('../models/GameProgress');
const Card = require('../models/Card');
const User = require('../models/User');

const router = express.Router();

// Drop old unique index on userId only (one-time migration)
let oldIndexDropped = false;
GameProgress.dropOldIndex().then(dropped => {
  if (dropped) {
    oldIndexDropped = true;
  }
}).catch(err => {
  console.log('Index migration check:', err.message);
});

// Save game progress
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      productId,
      levelNumber,
      cards, // Cards array with card-wise data
      totalScore,
      maxScore,
      correctAnswers,
      totalQuestions,
      percentageScore,
      riskLevel,
      isDemo
    } = req.body;

    // CRITICAL: Skip saving progress if isDemo is true (demo cards clicked)
    // Only save progress when isDemo is false (purchased/regular users)
    if (isDemo === true) {
      console.log(`⚠️ Demo user detected (isDemo=true) - skipping game progress save`);
      return res.status(200).json({ 
        message: 'Game progress skipped for demo user',
        skipped: true,
        isDemo: true
      });
    }

    console.log(`📊 Saving game progress - User: ${req.userId}, Level: ${levelNumber}, Product: ${productId}, Cards: ${cards?.length || 0}`);
    console.log(`📦 Request body:`, {
      productId: productId,
      levelNumber: levelNumber,
      cardsCount: cards?.length || 0,
      totalScore: totalScore,
      correctAnswers: correctAnswers,
      totalQuestions: totalQuestions,
      isDemo: isDemo
    });

    // Validation
    if (!levelNumber) {
      console.error('❌ Missing levelNumber');
      return res.status(400).json({ error: 'Missing required field: levelNumber' });
    }

    if (levelNumber < 1 || levelNumber > 3) {
      console.error(`❌ Invalid levelNumber: ${levelNumber}`);
      return res.status(400).json({ error: 'Level number must be between 1 and 3' });
    }

    if (!productId) {
      console.error('❌ Missing productId');
      return res.status(400).json({ error: 'Missing required field: productId' });
    }

    // Cards array validation - allow empty array but must be an array
    if (!cards || !Array.isArray(cards)) {
      return res.status(400).json({ error: 'Missing required field: cards array' });
    }
    
    // If cards array is empty, create empty progress entry (user started but didn't answer questions)
    // This ensures progress is saved even if user only plays one level without completing it

    // Get user
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Process cards array (handle empty array case)
    const processedCards = cards.length > 0 ? cards.map(card => {
      // Ensure cardId is properly formatted
      let cardId = card.cardId;
      if (cardId && typeof cardId === 'object') {
        cardId = cardId._id || cardId.id || cardId;
      }
      
      return {
        cardId: cardId,
        cardTitle: card.cardTitle || '',
        questions: card.questions || [],
        cardTotalScore: card.cardTotalScore || 0,
        cardMaxScore: card.cardMaxScore || 0,
        cardCorrectAnswers: card.cardCorrectAnswers || 0,
        cardTotalQuestions: card.cardTotalQuestions || 0,
        cardPercentageScore: card.cardPercentageScore || 0
      };
    }) : [];
    
    console.log(`📝 Processed ${processedCards.length} cards for level ${levelNumber}`);

    // Use provided stats or calculate from cards (handle empty cards case)
    const finalTotalScore = totalScore !== undefined ? totalScore : (processedCards.length > 0 ? processedCards.reduce((sum, card) => sum + card.cardTotalScore, 0) : 0);
    const finalCorrectAnswers = correctAnswers !== undefined ? correctAnswers : (processedCards.length > 0 ? processedCards.reduce((sum, card) => sum + card.cardCorrectAnswers, 0) : 0);
    const finalTotalQuestions = totalQuestions !== undefined ? totalQuestions : (processedCards.length > 0 ? processedCards.reduce((sum, card) => sum + card.cardTotalQuestions, 0) : 0);
    const finalMaxScore = maxScore !== undefined ? maxScore : (finalTotalQuestions > 0 ? finalTotalQuestions * 4 : 0);
    const finalPercentageScore = percentageScore !== undefined ? percentageScore : (finalMaxScore > 0 ? Math.round((finalTotalScore / finalMaxScore) * 100) : 0);
    
    // Calculate risk level based on percentage score if not provided
    let finalRiskLevel = riskLevel;
    if (!finalRiskLevel && finalPercentageScore !== undefined) {
      if (finalPercentageScore >= 84) {
        finalRiskLevel = 'Confident';
      } else if (finalPercentageScore >= 44) {
        finalRiskLevel = 'Cautious';
      } else {
        finalRiskLevel = 'Vulnerable';
      }
    }

    // Get the first cardId from cards (if available) for top-level cardId
    let firstCardId = null;
    if (processedCards.length > 0 && processedCards[0].cardId) {
      firstCardId = processedCards[0].cardId;
      // Ensure cardId is a valid ObjectId string
      if (typeof firstCardId === 'object' && firstCardId._id) {
        firstCardId = firstCardId._id;
      } else if (typeof firstCardId === 'object' && firstCardId.id) {
        firstCardId = firstCardId.id;
      }
    }

    console.log(`🔍 Looking for existing progress - User: ${req.userId}, Level: ${levelNumber}`);

    // IMPORTANT: Check if user already completed all 3 levels BEFORE we save/update progress
    // This prevents double-counting when user plays again
    let wasAlreadyCompletedBefore = false;
    if (levelNumber === 3) {
      const allProgressBefore = await GameProgress.find({ 
        userId: req.userId
      });
      
      console.log(`🔍 Checking progress before save - found ${allProgressBefore.length} progress records`);
      allProgressBefore.forEach(p => {
        console.log(`  - Level ${p.levelNumber}: completedAt=${p.completedAt ? 'Yes' : 'No'}, cards=${p.cards?.length || 0}, productId=${p.productId?.toString() || p.productId}`);
      });
      
      const level1CompleteBefore = allProgressBefore.some(p => 
        p.levelNumber === 1 && p.completedAt && p.cards && p.cards.length > 0
      );
      const level2CompleteBefore = allProgressBefore.some(p => 
        p.levelNumber === 2 && p.completedAt && p.cards && p.cards.length > 0
      );
      // For level 3, check if there's already a completed level 3 progress
      // Note: This check happens BEFORE we save the new progress, so we're checking old progress
      const level3CompleteBefore = allProgressBefore.some(p => 
        p.levelNumber === 3 && p.completedAt && p.cards && p.cards.length > 0
      );
      
      wasAlreadyCompletedBefore = level1CompleteBefore && level2CompleteBefore && level3CompleteBefore;
      console.log(`🔍 Check before save: L1=${level1CompleteBefore}, L2=${level2CompleteBefore}, L3=${level3CompleteBefore}, wasAlreadyCompletedBefore=${wasAlreadyCompletedBefore}`);
    }

    // Find or create progress document for this user and level (one document per user per level)
    let progress = await GameProgress.findOne({ 
      userId: req.userId, 
      levelNumber: levelNumber 
    });
    
    console.log(`📋 Existing progress found: ${progress ? 'Yes' : 'No'}`);

    if (!progress) {
      // Create new progress document for this level
      try {
        console.log(`✅ Creating new progress for level ${levelNumber}`);
        progress = await GameProgress.create({
          userId: req.userId,
          cardId: firstCardId || null,
          productId: productId,
          levelNumber: levelNumber,
          cards: processedCards,
          totalScore: finalTotalScore,
          maxScore: finalMaxScore,
          correctAnswers: finalCorrectAnswers,
          totalQuestions: finalTotalQuestions,
          percentageScore: finalPercentageScore,
          riskLevel: finalRiskLevel,
          isDemo: req.body.isDemo || false,
          completedAt: new Date()
        });
        console.log(`✅ Progress created successfully for level ${levelNumber} - ID: ${progress._id}`);
      } catch (createError) {
        // Handle old unique index on userId only
        if (createError.code === 11000 && createError.keyPattern && createError.keyPattern.userId && !createError.keyPattern.levelNumber) {
          console.log('⚠️ Old unique index detected, dropping it...');
          try {
            // Drop the old index
            await GameProgress.collection.dropIndex('userId_1');
            console.log('✅ Dropped old userId_1 unique index');
            // Retry creating the document
            progress = await GameProgress.create({
              userId: req.userId,
              cardId: firstCardId || null,
              productId: productId,
              levelNumber: levelNumber,
              cards: processedCards,
              totalScore: finalTotalScore,
              maxScore: finalMaxScore,
              correctAnswers: finalCorrectAnswers,
              totalQuestions: finalTotalQuestions,
              percentageScore: finalPercentageScore,
              riskLevel: finalRiskLevel,
              isDemo: req.body.isDemo || false,
              completedAt: new Date()
            });
          } catch (retryError) {
            // If still fails, check if document exists (race condition)
            progress = await GameProgress.findOne({ 
              userId: req.userId, 
              levelNumber: levelNumber 
            });
            if (!progress) {
              throw createError; // Re-throw original error if still can't create
            }
          }
        } else {
          throw createError; // Re-throw if it's a different error
        }
      }
    } else {
      // Update existing progress for this level
      console.log(`🔄 Updating existing progress for level ${levelNumber}`);
      progress.cardId = firstCardId || progress.cardId;
      progress.productId = productId;
      progress.cards = processedCards;
      progress.totalScore = finalTotalScore;
      progress.maxScore = finalMaxScore;
      progress.correctAnswers = finalCorrectAnswers;
      progress.totalQuestions = finalTotalQuestions;
      progress.percentageScore = finalPercentageScore;
      progress.riskLevel = finalRiskLevel;
      progress.isDemo = req.body.isDemo !== undefined ? req.body.isDemo : progress.isDemo;
      progress.completedAt = new Date();

      await progress.save();
      console.log(`✅ Progress updated successfully for level ${levelNumber}`);
    }

    // Populate references for response
    await progress.populate('productId', 'name');
    await progress.populate('cardId', 'title referenceCode category');
    
    // Populate cardId in cards array
    const Card = require('../models/Card');
    if (progress.cards && Array.isArray(progress.cards)) {
      for (let card of progress.cards) {
        if (card.cardId && typeof card.cardId !== 'object') {
          try {
            const cardDoc = await Card.findById(card.cardId).select('title referenceCode category');
            if (cardDoc) {
              card.cardId = cardDoc;
            }
          } catch (err) {
            console.error('Error populating card in cards array:', err);
          }
        }
      }
    }
    
    // Check if user has completed all 3 levels, and increment seat count if so
    // Only increment when level 3 is saved and all 3 levels are completed
    // CRITICAL: For demo users (B2C, B2B, B2E), seat increment is handled by increment-seat-on-completion endpoint
    // So we skip seat increment here for demo users to prevent duplicate increments
    if (levelNumber === 3) {
      try {
        // CRITICAL: Check if user is a purchased user (has paid transaction) or demo user
        // Priority: If user has a PAID transaction for this productId, they are a PURCHASED user
        const FreeTrial = require('../models/FreeTrial');
        const Transaction = require('../models/Transaction');
        const mongoose = require('mongoose');
        
        // First check: Does user have a PAID transaction for this productId? (PURCHASED USER)
        const progressProductId = productId?.toString();
        let isPurchasedUser = false;
        let purchasedTransaction = null;
        
        if (mongoose.Types.ObjectId.isValid(progressProductId)) {
          try {
            const productObjectId = new mongoose.Types.ObjectId(progressProductId);
            const userObjectId = new mongoose.Types.ObjectId(req.userId);
            
            console.log(`🔍 Searching for purchased transaction - userId: ${userObjectId}, productId: ${productObjectId}`);
            
            purchasedTransaction = await Transaction.findOne({
              userId: userObjectId,
              productId: productObjectId,
              status: 'paid'
            });
            
            if (purchasedTransaction) {
              isPurchasedUser = true;
              console.log(`✅ Purchased user detected - Transaction ID: ${purchasedTransaction._id}`);
              console.log(`📊 Transaction details: usedSeats=${purchasedTransaction.usedSeats || 0}, maxSeats=${purchasedTransaction.maxSeats || 0}`);
            } else {
              console.log(`⚠️ No purchased transaction found for userId: ${userObjectId}, productId: ${productObjectId}`);
            }
          } catch (err) {
            console.error(`❌ Error checking for purchased transaction: ${err.message}`);
            console.error(`❌ Error stack: ${err.stack}`);
          }
        } else {
          console.log(`⚠️ Invalid productId for ObjectId conversion: ${progressProductId}`);
        }
        
        // Only check for demo free trial if user is NOT a purchased user
        let isDemoUser = false;
        if (!isPurchasedUser) {
          // Check for demo free trial by gamePlays OR referrals (for reference code users)
          // Reference code users might not have gamePlays entry initially, but they'll be in referrals
          const demoFreeTrial = await FreeTrial.findOne({
            $or: [
              { 'gamePlays.userId': req.userId },
              { 'referrals.referredUserId': req.userId }
            ],
            targetAudience: { $exists: true, $ne: null },
            isDemo: true
          });
          
          if (demoFreeTrial) {
            isDemoUser = true;
            console.log(`🎮 Demo user detected (via gamePlays or referrals) - skipping seat increment in gameProgress (will be handled by increment-seat-on-completion endpoint)`);
          }
        }
        
        // If this is a demo user, skip seat increment here (it will be handled by increment-seat-on-completion endpoint)
        if (isDemoUser) {
          console.log(`🎮 Demo user detected - skipping seat increment in gameProgress (will be handled by increment-seat-on-completion endpoint)`);
        } else {
          // For purchased users OR organization members, proceed with seat increment logic
          // Organization members use organization's transaction, so we need to check for that too
          // For purchased users, proceed with seat increment logic
          // For non-demo users, proceed with seat increment logic
          // Check if user has completed all 3 levels NOW (after this save)
          // IMPORTANT: Query must include the progress we just saved
          const allProgress = await GameProgress.find({ 
            userId: req.userId
          });
          
          console.log(`📊 Total progress records found: ${allProgress.length}`);
          allProgress.forEach(p => {
            console.log(`  - Level ${p.levelNumber}: completedAt=${p.completedAt ? 'Yes' : 'No'}, cards=${p.cards?.length || 0}, productId=${p.productId?.toString() || p.productId}`);
          });
          
          const level1Complete = allProgress.some(p => p.levelNumber === 1 && p.completedAt && p.cards && p.cards.length > 0);
          const level2Complete = allProgress.some(p => p.levelNumber === 2 && p.completedAt && p.cards && p.cards.length > 0);
          const level3Complete = allProgress.some(p => p.levelNumber === 3 && p.completedAt && p.cards && p.cards.length > 0);
          
          const allLevelsCompleted = level1Complete && level2Complete && level3Complete;
          
          console.log(`🔍 Level completion status: L1=${level1Complete}, L2=${level2Complete}, L3=${level3Complete}, All=${allLevelsCompleted}`);
          
          // Use the wasAlreadyCompletedBefore check we did BEFORE saving progress
          // This ensures we only increment once when user first completes all 3 levels
          // However, if wasAlreadyCompletedBefore is true but usedSeats is still 0, 
          // we should still increment (edge case: progress exists but seat wasn't incremented before)
          const isFirstTimeCompletion = allLevelsCompleted && !wasAlreadyCompletedBefore;
          
          console.log(`🔍 Seat increment check: allLevelsCompleted=${allLevelsCompleted}, wasAlreadyCompletedBefore=${wasAlreadyCompletedBefore}, isFirstTimeCompletion=${isFirstTimeCompletion}`);
          
          // Use the transaction we already found for purchased users
          // This avoids duplicate queries
          let transaction = purchasedTransaction;
          const progressProductId = productId?.toString();
          
          // If transaction not found by direct userId, try fallback search (for organization members)
          if (!transaction) {
            console.log(`⚠️ Transaction not found by direct userId match, trying fallback search for organization members...`);
            
            // First, check if user is organization member and get organization transaction
            const User = require('../models/User');
            const Organization = require('../models/Organization');
            const currentUser = await User.findById(req.userId);
            
            if (currentUser && currentUser.organizationId) {
              console.log(`🔍 User is organization member (orgId: ${currentUser.organizationId}), checking organization transactions...`);
              
              const productObjectId = new mongoose.Types.ObjectId(progressProductId);
              const orgTransactions = await Transaction.find({
                organizationId: currentUser.organizationId,
                productId: productObjectId,
                status: 'paid',
                type: 'b2b_contract'
              })
              .populate('productId')
              .sort({ createdAt: -1 });
              
              console.log(`📋 Found ${orgTransactions.length} organization transactions for productId ${progressProductId}`);
              
              // Check if user is in organization.members array
              const organization = await Organization.findById(currentUser.organizationId);
              if (organization && organization.members) {
                const memberIds = organization.members.map(m => m.toString());
                const isMember = memberIds.includes(req.userId.toString());
                
                console.log(`🔍 Organization members: ${memberIds.join(', ')}, Current user: ${req.userId}, Is member: ${isMember}`);
                
                if (isMember && orgTransactions.length > 0) {
                  transaction = orgTransactions[0];
                  console.log(`✅ Found organization transaction for member: ${transaction._id}`);
                  console.log(`📊 Transaction details: usedSeats=${transaction.usedSeats}, maxSeats=${transaction.maxSeats}`);
                } else if (!isMember) {
                  console.log(`⚠️ User is not in organization.members array`);
                }
              } else {
                console.log(`⚠️ Organization not found or has no members array`);
              }
            }
            
            // If still not found, try finding by gamePlays (fallback)
            if (!transaction) {
              console.log(`🔍 Trying gamePlays search as fallback...`);
              const transactionsByGamePlays = await Transaction.find({
                'gamePlays.userId': req.userId,
                status: 'paid'
              })
              .populate('productId')
              .sort({ createdAt: -1 });
              
              console.log(`📋 Found ${transactionsByGamePlays.length} transactions with gamePlays for user ${req.userId}`);
              
              // Find matching transaction by productId
              for (const tx of transactionsByGamePlays) {
                const txProductId = tx.productId?._id?.toString() || tx.productId?.toString() || tx.productId;
                const txProductIdStr = txProductId?.toString();
                
                console.log(`🔍 Comparing: txProductId=${txProductIdStr}, progressProductId=${progressProductId}`);
                
                if (txProductIdStr === progressProductId) {
                  transaction = tx;
                  console.log(`✅ Found transaction by gamePlays + productId: ${transaction._id}`);
                  break;
                }
              }
            }
          }
          
          // Also check if transaction exists and usedSeats is 0 (edge case: progress complete but seat not incremented)
          const shouldIncrementSeat = isFirstTimeCompletion || (allLevelsCompleted && transaction && (transaction.usedSeats || 0) === 0);
          
          if (shouldIncrementSeat && transaction) {
            if (!isFirstTimeCompletion && allLevelsCompleted) {
              console.log(`⚠️ Edge case detected: wasAlreadyCompletedBefore=true but usedSeats=0, proceeding with increment`);
            }
            console.log(`🎉 User ${req.userId} has completed all 3 levels - incrementing seat count`);
            console.log(`🔍 Debug: wasAlreadyCompletedBefore = ${wasAlreadyCompletedBefore}, allLevelsCompleted = ${allLevelsCompleted}`);
            
            if (transaction) {
              console.log(`✅ Using transaction: ${transaction._id}`);
              console.log(`📊 Transaction details: usedSeats=${transaction.usedSeats}, maxSeats=${transaction.maxSeats}, type=${transaction.type || 'N/A'}`);
            } else {
              console.log(`❌ Transaction still not found after all fallback searches`);
            }
            
            if (!transaction) {
              console.log(`❌ No transaction found for user ${req.userId} with productId ${progressProductId}`);
              console.log(`🔍 Debug: Checking all user transactions...`);
              const allUserTransactions = await Transaction.find({ userId: req.userId, status: 'paid' })
                .populate('productId', '_id name')
                .select('_id productId status usedSeats maxSeats');
              console.log(`📋 All user transactions:`, allUserTransactions.map(tx => ({
                id: tx._id,
                productId: tx.productId?._id?.toString() || tx.productId?.toString(),
                productName: tx.productId?.name,
                usedSeats: tx.usedSeats,
                maxSeats: tx.maxSeats
              })));
            }
            
            // If no transaction found, try free trial
            let freeTrial = null;
            if (!transaction) {
              const freeTrials = await FreeTrial.find({
                'gamePlays.userId': req.userId,
                status: { $in: ['active', 'completed'] }
              }).sort({ createdAt: -1 });
              
              for (const ft of freeTrials) {
                const ftProductId = ft.productId?._id?.toString() || ft.productId?.toString();
                const progressProductId = productId?.toString();
                if (ftProductId === progressProductId) {
                  freeTrial = ft;
                  break;
                }
              }
            }
            
            // CRITICAL: Skip seat increment for demo users (B2C, B2B, B2E)
            // Demo users' seat increment is handled by increment-seat-on-completion endpoint
            // This prevents duplicate increments
            if (freeTrial && (freeTrial.isDemo || freeTrial.targetAudience)) {
              console.log(`🎮 Demo user detected (${freeTrial.targetAudience || 'unknown'}) - skipping seat increment in gameProgress`);
              console.log(`ℹ️ Seat increment for demo users is handled by increment-seat-on-completion endpoint`);
              // Skip the rest of the seat increment logic for demo users - just continue to next part
            } else {
          
              // Increment seat for transaction if found (non-demo users only)
              if (transaction) {
                console.log(`🔍 Transaction found - ID: ${transaction._id}, current usedSeats: ${transaction.usedSeats || 0}, maxSeats: ${transaction.maxSeats || 0}`);
                console.log(`🔍 Transaction details: userId=${transaction.userId}, productId=${transaction.productId}, status=${transaction.status}`);
                
                // CRITICAL: For first time completion, always increment usedSeats
                // wasAlreadyCompletedBefore check ensures we don't increment twice for "Play Again"
                const currentUsedSeats = transaction.usedSeats || 0;
                const maxSeats = transaction.maxSeats || 0;
                
                console.log(`🔍 Pre-increment check: currentUsedSeats=${currentUsedSeats}, maxSeats=${maxSeats}, wasAlreadyCompletedBefore=${wasAlreadyCompletedBefore}`);
                
                // Use atomic increment to prevent race conditions
                // This will increment even if usedSeats >= maxSeats (we track actual usage, not limit)
                const oldUsedSeats = transaction.usedSeats || 0;
                const updatedTransaction = await Transaction.findByIdAndUpdate(
                  transaction._id,
                  { $inc: { usedSeats: 1 } },
                  { new: true } // Return updated document
                );
                
                if (updatedTransaction) {
                  console.log(`✅ Successfully incremented usedSeats for transaction ${transaction._id}: ${oldUsedSeats} -> ${updatedTransaction.usedSeats}`);
                } else {
                  console.error(`❌ Failed to increment usedSeats - Transaction.findByIdAndUpdate returned null`);
                  console.error(`❌ Transaction._id: ${transaction._id}`);
                }
                
                // Update transaction reference for organization/school updates
                transaction = updatedTransaction;
                
                // Update organization/school seatUsage if transaction belongs to one
                if (transaction.organizationId) {
              try {
                const Organization = require('../models/Organization');
                const organization = await Organization.findById(transaction.organizationId);
                if (organization) {
                  const orgTransactions = await Transaction.find({ 
                    organizationId: transaction.organizationId,
                    status: 'paid'
                  });
                  const orgFreeTrials = await FreeTrial.find({ 
                    organizationId: transaction.organizationId
                  });
                  const transactionUsedSeats = orgTransactions.reduce((sum, tx) => sum + (tx.usedSeats || 0), 0);
                  const freeTrialUsedSeats = orgFreeTrials.reduce((sum, ft) => sum + (ft.usedSeats || 0), 0);
                  const totalUsedSeats = transactionUsedSeats + freeTrialUsedSeats;
                  
                  if (!organization.seatUsage) {
                    organization.seatUsage = { seatLimit: 0, usedSeats: 0, status: 'prospect' };
                  }
                  organization.seatUsage.usedSeats = totalUsedSeats;
                  await organization.save();
                }
              } catch (err) {
                console.error('Error updating organization seatUsage:', err);
              }
            }
            
            if (transaction.schoolId) {
              try {
                const School = require('../models/School');
                const school = await School.findById(transaction.schoolId);
                if (school) {
                  const schoolTransactions = await Transaction.find({ 
                    schoolId: transaction.schoolId,
                    status: 'paid'
                  });
                  const totalUsedSeats = schoolTransactions.reduce((sum, tx) => sum + (tx.usedSeats || 0), 0);
                  
                  if (!school.seatUsage) {
                    school.seatUsage = { seatLimit: 0, usedSeats: 0, status: 'prospect' };
                  }
                  school.seatUsage.usedSeats = totalUsedSeats;
                  await school.save();
                }
              } catch (err) {
                console.error('Error updating school seatUsage:', err);
              }
            }
          } else if (freeTrial) {
            // CRITICAL: Check if user has already completed (prevent duplicate increment)
            // Reload free trial to get latest state
            const currentFreeTrial = await FreeTrial.findById(freeTrial._id);
            const hasUserCompleted = currentFreeTrial.gamePlays?.some(
              (play) => play.userId && play.userId.toString() === req.userId.toString() && play.completed
            );
            
            if (hasUserCompleted) {
              console.log(`⚠️ User ${req.userId} has already completed - skipping seat increment`);
              freeTrial = currentFreeTrial; // Use current state
            } else {
              // Use atomic increment with condition to prevent race conditions
              // Only increment if user hasn't completed yet
              const userPlayIndex = currentFreeTrial.gamePlays?.findIndex(
                (play) => play.userId && play.userId.toString() === req.userId.toString()
              );
              
              const newUsedSeats = (currentFreeTrial.usedSeats || 0) + 1;
              const maxSeats = currentFreeTrial.maxSeats || 2;
              
              // Build update query with atomic operations
              let updateQuery = { $inc: { usedSeats: 1 } };
              
              // Update or add game play entry
              if (userPlayIndex >= 0) {
                // Update existing game play entry
                updateQuery.$set = {
                  [`gamePlays.${userPlayIndex}.completed`]: true,
                  [`gamePlays.${userPlayIndex}.completedAt`]: new Date()
                };
              } else {
                // Add new game play entry
                updateQuery.$push = {
                  gamePlays: {
                    userId: req.userId,
                    startedAt: new Date(),
                    completed: true,
                    completedAt: new Date()
                  }
                };
              }
              
              // Update status if all seats will be used
              if (newUsedSeats >= maxSeats) {
                if (!updateQuery.$set) updateQuery.$set = {};
                updateQuery.$set.status = 'completed';
              }
              
              // Use findOneAndUpdate with condition to prevent duplicate increment
              // Only update if user's game play is not already completed
              const updatedFreeTrial = await FreeTrial.findOneAndUpdate(
                {
                  _id: freeTrial._id,
                  $or: [
                    { 'gamePlays': { $exists: false } },
                    { 'gamePlays': { $size: 0 } },
                    { 
                      'gamePlays': { 
                        $not: { 
                          $elemMatch: { 
                            userId: req.userId, 
                            completed: true 
                          } 
                        } 
                      } 
                    }
                  ]
                },
                updateQuery,
                { new: true }
              );
              
              if (updatedFreeTrial) {
                console.log(`✅ Incremented usedSeats for free trial ${freeTrial._id}: ${currentFreeTrial.usedSeats || 0} -> ${updatedFreeTrial.usedSeats}`);
                freeTrial = updatedFreeTrial;
              } else {
                console.log(`⚠️ Could not increment seat - user may have already completed or condition not met`);
                // Reload to get current state
                freeTrial = await FreeTrial.findById(freeTrial._id);
              }
            }
            
            // Update organization seatUsage if free trial belongs to one
            if (freeTrial.organizationId) {
              try {
                const Organization = require('../models/Organization');
                const organization = await Organization.findById(freeTrial.organizationId);
                if (organization) {
                  const orgTransactions = await Transaction.find({ 
                    organizationId: freeTrial.organizationId,
                    status: 'paid'
                  });
                  const orgFreeTrials = await FreeTrial.find({ 
                    organizationId: freeTrial.organizationId
                  });
                  const transactionUsedSeats = orgTransactions.reduce((sum, tx) => sum + (tx.usedSeats || 0), 0);
                  const freeTrialUsedSeats = orgFreeTrials.reduce((sum, ft) => sum + (ft.usedSeats || 0), 0);
                  const totalUsedSeats = transactionUsedSeats + freeTrialUsedSeats;
                  
                  if (!organization.seatUsage) {
                    organization.seatUsage = { seatLimit: 0, usedSeats: 0, status: 'prospect' };
                  }
                  organization.seatUsage.usedSeats = totalUsedSeats;
                  await organization.save();
                }
              } catch (err) {
                console.error('Error updating organization seatUsage:', err);
              }
            }
          } else {
            console.log(`⚠️ Could not find transaction or free trial for user ${req.userId} with productId ${productId}`);
          }
            }
          }
        }
      } catch (seatError) {
        // Don't fail progress saving if seat increment fails
        console.error('Error incrementing seat count:', seatError);
      }
    }

    console.log(`✅ Successfully saved/updated progress for user ${req.userId}, level ${levelNumber}`);
    res.status(201).json({
      message: 'Game progress saved successfully',
      progress: progress
    });
  } catch (error) {
    console.error('❌ Error saving game progress:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      keyPattern: error.keyPattern,
      userId: req.userId,
      levelNumber: req.body.levelNumber,
      productId: req.body.productId
    });
    res.status(500).json({ 
      error: 'Failed to save game progress: ' + error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get user's progress for a specific card
router.get('/card/:cardId', authenticateToken, async (req, res) => {
  try {
    const { cardId } = req.params;
    const Card = require('../models/Card');

    // Find all progress documents for this user (one per level)
    const allProgress = await GameProgress.find({
      userId: req.userId
    })
      .populate('productId', 'name')
      .sort({ levelNumber: 1 });

    if (!allProgress || allProgress.length === 0) {
      return res.json([]);
    }

    // Filter cards by cardId from all levels
    const result = [];
    for (let progress of allProgress) {
      const levelNum = progress.levelNumber;
      
      if (progress.cards && Array.isArray(progress.cards)) {
        // Find card matching the cardId
        const matchingCard = progress.cards.find(card => {
          const cardIdStr = card.cardId?._id?.toString() || card.cardId?.toString();
          return cardIdStr === cardId;
        });

        if (matchingCard && matchingCard.questions && matchingCard.questions.length > 0) {
          // Populate cardId if needed
          if (matchingCard.cardId && typeof matchingCard.cardId !== 'object') {
            try {
              const cardDoc = await Card.findById(matchingCard.cardId).select('title referenceCode category');
              if (cardDoc) {
                matchingCard.cardId = cardDoc;
              }
            } catch (err) {
              console.error('Error populating card:', err);
            }
          }

          result.push({
            levelNumber: levelNum,
            card: matchingCard,
            totalScore: matchingCard.cardTotalScore || 0,
            correctAnswers: matchingCard.cardCorrectAnswers || 0,
            totalQuestions: matchingCard.cardTotalQuestions || 0,
            maxScore: matchingCard.cardMaxScore || 0,
            percentageScore: matchingCard.cardPercentageScore || 0,
            completedAt: progress.completedAt
          });
        }
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching card progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Get specific user's progress (for admin viewing)
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const Card = require('../models/Card');
    const Package = require('../models/Package');
    
    // Find all progress documents for this user (one per level)
    const allProgress = await GameProgress.find({
      userId: userId
    })
      .populate('productId', 'name level1 level2 level3')
      .populate('userId', 'name email')
      .populate('cardId', 'title referenceCode category')
      .sort({ levelNumber: 1 });

    if (!allProgress || allProgress.length === 0) {
      return res.json(null);
    }

    // Get package's included card IDs or product's level card IDs to filter
    let allowedCardIds = null;
    const firstProgress = allProgress[0];
    const Product = require('../models/Product');
    
    if (firstProgress.productId) {
      // If productId exists, get cards from product's level arrays
      const product = await Product.findById(firstProgress.productId).select('level1 level2 level3');
      if (product) {
        // Combine all level arrays for filtering
        const allProductCardIds = [
          ...(product.level1 || []),
          ...(product.level2 || []),
          ...(product.level3 || [])
        ];
        allowedCardIds = allProductCardIds.map(id => id.toString());
      }
    }

    // Combine all levels into a single response structure
    const combinedProgress = {
      userId: firstProgress.userId,
      productId: firstProgress.productId,
      level1: [],
      level1Stats: { totalScore: 0, maxScore: 0, correctAnswers: 0, totalQuestions: 0, percentageScore: 0, riskLevel: null, completedAt: null },
      level2: [],
      level2Stats: { totalScore: 0, maxScore: 0, correctAnswers: 0, totalQuestions: 0, percentageScore: 0, riskLevel: null, completedAt: null },
      level3: [],
      level3Stats: { totalScore: 0, maxScore: 0, correctAnswers: 0, totalQuestions: 0, percentageScore: 0, riskLevel: null, completedAt: null },
      createdAt: firstProgress.createdAt,
      updatedAt: allProgress[allProgress.length - 1].updatedAt
    };

    // Process each level document
    for (let progress of allProgress) {
      const levelNum = progress.levelNumber;
      const levelKey = `level${levelNum}`;
      const statsKey = `${levelKey}Stats`;
      
      // Use cards array
      let filteredCards = [];
      
      if (progress.cards && Array.isArray(progress.cards) && progress.cards.length > 0) {
        for (let card of progress.cards) {
          const cardId = card.cardId?._id?.toString() || card.cardId?.toString();
          
          // Filter: only include cards that are in the purchased package/product
          if (allowedCardIds && cardId && !allowedCardIds.includes(cardId)) {
            continue; // Skip cards not in purchased package/product
          }
          
          // Populate cardId if needed
          if (card.cardId && typeof card.cardId !== 'object') {
            try {
              const cardDoc = await Card.findById(card.cardId).select('title referenceCode category');
              if (cardDoc) {
                card.cardId = cardDoc;
              }
            } catch (err) {
              console.error('Error populating card in cards array:', err);
            }
          }
          
          filteredCards.push(card);
        }
      }
      
      combinedProgress[levelKey] = filteredCards;
      
      // Use stats from the document
      combinedProgress[statsKey] = {
        totalScore: progress.totalScore || 0,
        maxScore: progress.maxScore || 0,
        correctAnswers: progress.correctAnswers || 0,
        totalQuestions: progress.totalQuestions || 0,
        percentageScore: progress.percentageScore || 0,
        riskLevel: progress.riskLevel || null,
        completedAt: progress.completedAt
      };
    }

    res.json(combinedProgress);
  } catch (error) {
    console.error('Error fetching user progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Get user's all progress (for authenticated user)
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const Card = require('../models/Card');
    const Package = require('../models/Package');
    
    // Find all progress documents for this user (one per level)
    const allProgress = await GameProgress.find({
      userId: req.userId
    })
      .populate('productId', 'name level1 level2 level3')
      .populate('cardId', 'title referenceCode category')
      .sort({ levelNumber: 1 });

    if (!allProgress || allProgress.length === 0) {
      return res.json(null);
    }

    // Get package's included card IDs or product's level card IDs to filter
    let allowedCardIds = null;
    const firstProgress = allProgress[0];
    const Product = require('../models/Product');
    
    if (firstProgress.productId) {
      // If productId exists, get cards from product's level arrays
      const product = await Product.findById(firstProgress.productId).select('level1 level2 level3');
      if (product) {
        // Combine all level arrays for filtering
        const allProductCardIds = [
          ...(product.level1 || []),
          ...(product.level2 || []),
          ...(product.level3 || [])
        ];
        allowedCardIds = allProductCardIds.map(id => id.toString());
      }
    }

    // Combine all levels into a single response structure
    const combinedProgress = {
      userId: firstProgress.userId,
      productId: firstProgress.productId,
      level1: [],
      level1Stats: { totalScore: 0, maxScore: 0, correctAnswers: 0, totalQuestions: 0, percentageScore: 0, riskLevel: null, completedAt: null },
      level2: [],
      level2Stats: { totalScore: 0, maxScore: 0, correctAnswers: 0, totalQuestions: 0, percentageScore: 0, riskLevel: null, completedAt: null },
      level3: [],
      level3Stats: { totalScore: 0, maxScore: 0, correctAnswers: 0, totalQuestions: 0, percentageScore: 0, riskLevel: null, completedAt: null },
      createdAt: firstProgress.createdAt,
      updatedAt: allProgress[allProgress.length - 1].updatedAt
    };

    // Process each level document
    for (let progress of allProgress) {
      const levelNum = progress.levelNumber;
      const levelKey = `level${levelNum}`;
      const statsKey = `${levelKey}Stats`;
      
      // Use cards array
      let filteredCards = [];
      
      if (progress.cards && Array.isArray(progress.cards) && progress.cards.length > 0) {
        for (let card of progress.cards) {
          const cardId = card.cardId?._id?.toString() || card.cardId?.toString();
          
          // Filter: only include cards that are in the purchased package/product
          if (allowedCardIds && cardId && !allowedCardIds.includes(cardId)) {
            continue; // Skip cards not in purchased package/product
          }
          
          // Populate cardId if needed
          if (card.cardId && typeof card.cardId !== 'object') {
            try {
              const cardDoc = await Card.findById(card.cardId).select('title referenceCode category');
              if (cardDoc) {
                card.cardId = cardDoc;
              }
            } catch (err) {
              console.error('Error populating card in cards array:', err);
            }
          }
          
          filteredCards.push(card);
        }
      }
      
      combinedProgress[levelKey] = filteredCards;
      
      // Use stats from the document
      combinedProgress[statsKey] = {
        totalScore: progress.totalScore || 0,
        maxScore: progress.maxScore || 0,
        correctAnswers: progress.correctAnswers || 0,
        totalQuestions: progress.totalQuestions || 0,
        percentageScore: progress.percentageScore || 0,
        riskLevel: progress.riskLevel || null,
        completedAt: progress.completedAt
      };
    }

    res.json(combinedProgress);
  } catch (error) {
    console.error('Error fetching user progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

// Get leaderboard for a specific card and level
router.get('/leaderboard/card/:cardId/level/:levelNumber', async (req, res) => {
  try {
    const { cardId, levelNumber } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const levelNum = parseInt(levelNumber);

    // Find all progress documents for this level
    const allProgress = await GameProgress.find({
      levelNumber: levelNum
    })
      .populate('userId', 'name email')
      .populate('productId', 'name');

    // Filter and calculate scores for this specific card and level
    const leaderboard = allProgress
      .map(p => {
        const cardQuestions = p.questions.filter(q => {
          const qCardId = q.cardId?._id?.toString() || q.cardId?.toString();
          return qCardId === cardId;
        });

        if (cardQuestions.length > 0) {
          const cardScore = cardQuestions.reduce((sum, q) => sum + (q.points || 0), 0);
          return {
            userId: p.userId,
            levelNumber: levelNum,
            totalScore: cardScore,
            correctAnswers: cardQuestions.filter(q => q.isCorrect === true).length,
            totalQuestions: cardQuestions.length,
            completedAt: p.completedAt || p.updatedAt
          };
        }
        return null;
      })
      .filter(p => p !== null)
      .sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return new Date(a.completedAt) - new Date(b.completedAt);
      })
      .slice(0, limit);

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get user's best score for a card and level
router.get('/best/card/:cardId/level/:levelNumber', authenticateToken, async (req, res) => {
  try {
    const { cardId, levelNumber } = req.params;
    const levelNum = parseInt(levelNumber);

    // Find progress document for this user and level
    const progress = await GameProgress.findOne({
      userId: req.userId,
      levelNumber: levelNum
    })
      .populate('productId', 'name')
      .populate('cardId', 'title referenceCode category');

    if (!progress) {
      return res.status(404).json({ error: 'No progress found' });
    }

    // Filter cards for this cardId
    const Card = require('../models/Card');
    let matchingCard = null;
    
    if (progress.cards && Array.isArray(progress.cards)) {
      matchingCard = progress.cards.find(card => {
        const cardIdStr = card.cardId?._id?.toString() || card.cardId?.toString();
        return cardIdStr === cardId;
      });
    }

    if (!matchingCard || !matchingCard.questions || matchingCard.questions.length === 0) {
      return res.status(404).json({ error: 'No progress found for this card and level' });
    }

    // Populate cardId if needed
    if (matchingCard.cardId && typeof matchingCard.cardId !== 'object') {
      try {
        const cardDoc = await Card.findById(matchingCard.cardId).select('title referenceCode category');
        if (cardDoc) {
          matchingCard.cardId = cardDoc;
        }
      } catch (err) {
        console.error('Error populating card:', err);
      }
    }

    const bestProgress = {
      ...progress.toObject(),
      levelNumber: levelNum,
      card: matchingCard,
      totalScore: matchingCard.cardTotalScore || 0,
      correctAnswers: matchingCard.cardCorrectAnswers || 0,
      totalQuestions: matchingCard.cardTotalQuestions || 0,
      maxScore: matchingCard.cardMaxScore || 0,
      percentageScore: matchingCard.cardPercentageScore || 0,
      completedAt: progress.completedAt
    };

    res.json(bestProgress);
  } catch (error) {
    console.error('Error fetching best progress:', error);
    res.status(500).json({ error: 'Failed to fetch best progress' });
  }
});

module.exports = router;

