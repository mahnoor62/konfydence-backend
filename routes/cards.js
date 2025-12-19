const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const Card = require('../models/Card');

const router = express.Router();

// Public endpoint for game (no authentication required)
router.get('/public/game', async (req, res) => {
  try {
    const { level, packageId, productId } = req.query;
    const Package = require('../models/Package');
    const Product = require('../models/Product');
    
    let cardIds = null;
    
    // Priority: productId > packageId
    if (productId) {
      // Fetch cards from product's level arrays based on level
      const product = await Product.findById(productId).select('level1 level2 level3 type');
      if (product) {
        // Get cards for the specific level
        if (level === '1' && product.level1 && product.level1.length > 0) {
          cardIds = product.level1.map(id => id.toString());
        } else if (level === '2' && product.level2 && product.level2.length > 0) {
          cardIds = product.level2.map(id => id.toString());
        } else if (level === '3' && product.level3 && product.level3.length > 0) {
          cardIds = product.level3.map(id => id.toString());
        }
        
        // If no cards for this level, return empty
        if (!cardIds || cardIds.length === 0) {
          return res.json({
            level: level ? parseInt(level) : null,
            questions: [],
            totalAvailable: 0
          });
        }
      }
    } else if (packageId) {
      // Fallback to package if no productId
      const packageDoc = await Package.findById(packageId).select('includedCardIds');
      if (packageDoc && packageDoc.includedCardIds && packageDoc.includedCardIds.length > 0) {
        cardIds = packageDoc.includedCardIds.map(id => id.toString());
      } else {
        // If package has no cards, return empty
        return res.json({
          level: level ? parseInt(level) : null,
          questions: [],
          totalAvailable: 0
        });
      }
    }
    
    const query = {};
    if (cardIds) {
      query._id = { $in: cardIds };
    }
    
    // Fetch cards (filtered by product level or package)
    const cardsMap = {};
    const fetchedCards = await Card.find(query);
    
    // Create a map for quick lookup
    fetchedCards.forEach(card => {
      cardsMap[card._id.toString()] = card;
    });
    
    // Maintain the order from cardIds array (product level order)
    const cards = [];
    if (cardIds && cardIds.length > 0) {
      // Iterate through cardIds in the order they appear in product level arrays
      cardIds.forEach(cardId => {
        const card = cardsMap[cardId];
        if (card) {
          cards.push(card);
        }
      });
    } else {
      // Fallback: if no cardIds order, use fetched cards (shouldn't happen)
      cards.push(...fetchedCards);
    }
    
    // Aggregate all questions from all filtered cards (in order)
    const allQuestions = [];
    
    cards.forEach(card => {
      if (card.question) {
        allQuestions.push({
          ...card.question.toObject(),
          cardId: card._id,
          cardTitle: card.title
        });
      }
    });
    
    // Return aggregated questions (limit to 30 for game)
    res.json({
      level: level ? parseInt(level) : null,
      questions: allQuestions.slice(0, 30),
      totalAvailable: allQuestions.length
    });
  } catch (error) {
    console.error('Error fetching game cards:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', authenticateToken, checkPermission('cards'), async (req, res) => {
  try {
    const { status, category, targetAudience, tag, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (targetAudience) query.targetAudiences = targetAudience;
    if (tag) query.tags = tag;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const cards = await Card.find(query).sort({ updatedAt: -1 });
    res.json(cards);
  } catch (error) {
    console.error('Error fetching cards:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticateToken, checkPermission('cards'), async (req, res) => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    res.json(card);
  } catch (error) {
    console.error('Error fetching card:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  checkPermission('cards'),
  [
    body('title').notEmpty().trim(),
    body('questions').optional().isArray().withMessage('Questions must be an array')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      console.log('=== CREATE CARD REQUEST ===');
      
      // Validate and clean question structure
      const q = req.body.question || {};
      
      // Validate required fields
      const missingFields = [];
      if (!q.description || !q.description.trim()) {
        missingFields.push('description');
      }
      
      if (missingFields.length > 0) {
        throw new Error(`Question: Missing required fields: ${missingFields.join(', ')}`);
      }
      
      // Validate answers - must have exactly 4 if provided
      if (q.answers && q.answers.length > 0) {
        if (q.answers.length !== 4) {
          throw new Error(`Question: Question must have exactly 4 answers`);
        }
        // Validate that all answers have text
        const emptyAnswers = q.answers.filter((a, idx) => !a.text || !a.text.trim());
        if (emptyAnswers.length > 0) {
          throw new Error(`Question: All 4 answers must have text`);
        }
      }
      
      // Ensure answers array has 4 items (fill with empty if needed)
      const answers = q.answers && q.answers.length === 4
        ? q.answers
        : [
            { text: q.answers?.[0]?.text || '', scoring: q.answers?.[0]?.scoring || 0 },
            { text: q.answers?.[1]?.text || '', scoring: q.answers?.[1]?.scoring || 0 },
            { text: q.answers?.[2]?.text || '', scoring: q.answers?.[2]?.scoring || 0 },
            { text: q.answers?.[3]?.text || '', scoring: q.answers?.[3]?.scoring || 0 }
          ];
      
      const question = {
        description: q.description.trim(),
        answers: answers.map(a => ({
          text: a.text || '',
          scoring: a.scoring || 0
        })),
        feedback: q.feedback || '',
        attachments: (q.attachments || []).filter(att => att && att.type && att.url && att.title).map(att => ({
          type: att.type,
          url: att.url,
          title: att.title
        }))
      };
      
      const cardData = {
        title: req.body.title.trim(),
        category: req.body.category || '',
        visibility: req.body.visibility || 'public',
        targetAudiences: req.body.targetAudiences || [],
        tags: req.body.tags || [],
        question: question
      };
      
      console.log('Card data to save:', JSON.stringify(cardData, null, 2));
      console.log('Question created successfully');
      
      const card = await Card.create(cardData);
      console.log('Card created successfully');
      res.status(201).json(card);
    } catch (error) {
      console.error('Error creating card:', error);
      console.error('Error details:', error.message);
      if (error.errors) {
        console.error('Validation errors:', JSON.stringify(error.errors, null, 2));
      }
      // Return concise, specific error messages
      let errorMessage = 'Failed to create card';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.errors) {
        const firstError = Object.values(error.errors)[0];
        errorMessage = firstError?.message || errorMessage;
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.put(
  '/:id',
  authenticateToken,
  checkPermission('cards'),
  [
    body('title').optional().notEmpty().trim(),
    body('questions').optional().isArray().withMessage('Questions must be an array')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      console.log('=== UPDATE CARD REQUEST ===');
      console.log('Card ID:', req.params.id);

      const updateData = {};
      
      if (req.body.title !== undefined) updateData.title = req.body.title.trim();
      if (req.body.category !== undefined) updateData.category = req.body.category;
      if (req.body.visibility !== undefined) updateData.visibility = req.body.visibility;
      if (req.body.targetAudiences !== undefined) updateData.targetAudiences = req.body.targetAudiences;
      if (req.body.tags !== undefined) updateData.tags = req.body.tags;
      
      // Only update question if it is explicitly provided
      if (req.body.question !== undefined) {
        const q = req.body.question || {};
        
        // Validate required fields
        const missingFields = [];
        if (!q.description || !q.description.trim()) {
          missingFields.push('description');
        }
        
        if (missingFields.length > 0) {
          throw new Error(`Question: Missing required fields: ${missingFields.join(', ')}`);
        }
        
        // Validate answers - must have exactly 4 if provided
        if (q.answers && q.answers.length > 0) {
          if (q.answers.length !== 4) {
            throw new Error(`Question: Question must have exactly 4 answers`);
          }
          // Validate that all answers have text
          const emptyAnswers = q.answers.filter((a, idx) => !a.text || !a.text.trim());
          if (emptyAnswers.length > 0) {
            throw new Error(`Question: All 4 answers must have text`);
          }
        }
        
        // Ensure answers array has 4 items (fill with empty if needed)
        const answers = q.answers && q.answers.length === 4
          ? q.answers
          : [
              { text: q.answers?.[0]?.text || '', scoring: q.answers?.[0]?.scoring || 0 },
              { text: q.answers?.[1]?.text || '', scoring: q.answers?.[1]?.scoring || 0 },
              { text: q.answers?.[2]?.text || '', scoring: q.answers?.[2]?.scoring || 0 },
              { text: q.answers?.[3]?.text || '', scoring: q.answers?.[3]?.scoring || 0 }
            ];
        
        updateData.question = {
          description: q.description.trim(),
          answers: answers.map(a => ({
            text: a.text || '',
            scoring: a.scoring || 0
          })),
          feedback: q.feedback || '',
          attachments: (q.attachments || []).filter(att => att && att.type && att.url && att.title).map(att => ({
            type: att.type,
            url: att.url,
            title: att.title
          }))
        };
      }

      console.log('Update data:', JSON.stringify(updateData, null, 2));
      
      const card = await Card.findByIdAndUpdate(
        req.params.id,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!card) {
        return res.status(404).json({ error: 'Card not found' });
      }

      console.log('Card updated successfully');
      res.json(card);
    } catch (error) {
      console.error('Error updating card:', error);
      console.error('Error details:', error.message);
      if (error.errors) {
        console.error('Validation errors:', JSON.stringify(error.errors, null, 2));
      }
      // Return concise, specific error messages
      let errorMessage = 'Failed to update card';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.errors) {
        const firstError = Object.values(error.errors)[0];
        errorMessage = firstError?.message || errorMessage;
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

router.post(
  '/:id/question/attachments',
  authenticateToken,
  checkPermission('cards'),
  [
    body('type').isIn(['audio', 'video', 'pdf', 'word', 'link']).withMessage('Invalid attachment type'),
    body('url').notEmpty().withMessage('URL is required'),
    body('title').notEmpty().withMessage('Title is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const card = await Card.findById(req.params.id);
      if (!card) {
        return res.status(404).json({ error: 'Card not found' });
      }

      if (!card.question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      const newAttachment = {
        type: req.body.type,
        url: req.body.url,
        title: req.body.title
      };

      if (!card.question.attachments) {
        card.question.attachments = [];
      }

      card.question.attachments.push(newAttachment);
      await card.save();

      res.status(200).json(card);
    } catch (error) {
      console.error('Error adding attachment:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.delete('/:id/question/attachments/:attachmentId', authenticateToken, checkPermission('cards'), async (req, res) => {
    try {
      const card = await Card.findById(req.params.id);
      if (!card) {
        return res.status(404).json({ error: 'Card not found' });
      }

      if (!card.question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      card.question.attachments = card.question.attachments.filter(
        att => att._id.toString() !== req.params.attachmentId
      );
      await card.save();

      res.json(card);
    } catch (error) {
      console.error('Error removing attachment:', error);
      res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/:id', authenticateToken, checkPermission('cards'), async (req, res) => {
  try {
    const card = await Card.findByIdAndDelete(req.params.id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    res.json({ message: 'Card deleted successfully' });
  } catch (error) {
    console.error('Error deleting card:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

