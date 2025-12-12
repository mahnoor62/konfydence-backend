const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const Card = require('../models/Card');

const router = express.Router();

// Public endpoint for game (no authentication required)
router.get('/public/game', async (req, res) => {
  try {
    const { level } = req.query;
    const query = {};

    // Fetch all cards
    const cards = await Card.find(query).sort({ updatedAt: -1 });
    
    // If level is provided, aggregate all questions from that level across all cards
    if (level) {
      const levelNum = parseInt(level);
      const allQuestions = [];
      
      cards.forEach(card => {
        const levelData = card.levels?.find(l => l.levelNumber === levelNum);
        if (levelData && levelData.questions && levelData.questions.length > 0) {
          levelData.questions.forEach(question => {
            allQuestions.push({
              ...question.toObject(),
              cardId: card._id,
              cardTitle: card.title
            });
          });
        }
      });
      
      // Return aggregated questions (limit to 30 for game)
      res.json({
        level: levelNum,
        questions: allQuestions.slice(0, 30),
        totalAvailable: allQuestions.length
      });
    } else {
      // Return all cards if no level specified
      res.json(cards);
    }
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
    body('levels').optional().isArray().withMessage('Levels must be an array')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      console.log('=== CREATE CARD REQUEST ===');
      
      // Validate and clean levels structure - allow any number of levels (0-3) and questions
      const levels = (req.body.levels || []).map((level, index) => {
        const levelNumber = level.levelNumber || (index + 1);
        const questions = (level.questions || []).map(q => {
          // Validate required fields for questions
          const missingFields = [];
          if (!q.title || !q.title.trim()) {
            missingFields.push('title');
          }
          if (!q.description || !q.description.trim()) {
            missingFields.push('question');
          }
          
          if (missingFields.length > 0) {
            throw new Error(`Level ${levelNumber}: Missing required fields: ${missingFields.join(', ')}`);
          }
          
          // Validate answers - must have exactly 4 if provided
          if (q.answers && q.answers.length > 0) {
            if (q.answers.length !== 4) {
              throw new Error(`Level ${levelNumber}: Question must have exactly 4 answers`);
            }
            // Validate that all answers have text
            const emptyAnswers = q.answers.filter((a, idx) => !a.text || !a.text.trim());
            if (emptyAnswers.length > 0) {
              throw new Error(`Level ${levelNumber}: All 4 answers must have text`);
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
          
          return {
            title: q.title.trim(),
            description: q.description.trim(),
            category: q.category || '',
            tags: q.tags || [],
            targetAudiences: q.targetAudiences || [],
            visibility: q.visibility || 'public',
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
        });
        
        return {
          levelNumber: levelNumber,
          questions: questions
        };
      });
      
      const cardData = {
        title: req.body.title,
        levels: levels
      };
      
      console.log('Card data to save:', JSON.stringify(cardData, null, 2));
      console.log('Levels count:', cardData.levels.length);
      
      const card = await Card.create(cardData);
      console.log('Card created successfully. Levels:', card.levels?.length || 0);
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
    body('levels').optional().isArray().withMessage('Levels must be an array')
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
      
      if (req.body.title !== undefined) updateData.title = req.body.title;
      
      // Only update levels if they are explicitly provided
      if (req.body.levels !== undefined) {
        const levels = (req.body.levels || []).map((level, index) => {
          const levelNumber = level.levelNumber || (index + 1);
          const questions = (level.questions || []).map(q => {
            // Validate required fields for questions
            const missingFields = [];
            if (!q.title || !q.title.trim()) {
              missingFields.push('title');
            }
            if (!q.description || !q.description.trim()) {
              missingFields.push('question');
            }
            
            if (missingFields.length > 0) {
              throw new Error(`Level ${levelNumber}: Missing required fields: ${missingFields.join(', ')}`);
            }
            
            // Validate answers - must have exactly 4 if provided
            if (q.answers && q.answers.length > 0) {
              if (q.answers.length !== 4) {
                throw new Error(`Level ${levelNumber}: Question must have exactly 4 answers`);
              }
              // Validate that all answers have text
              const emptyAnswers = q.answers.filter((a, idx) => !a.text || !a.text.trim());
              if (emptyAnswers.length > 0) {
                throw new Error(`Level ${levelNumber}: All 4 answers must have text`);
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
            
            return {
              title: q.title.trim(),
              description: q.description.trim(),
              category: q.category || '',
              tags: q.tags || [],
              targetAudiences: q.targetAudiences || [],
              visibility: q.visibility || 'public',
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
          });
          
          return {
            levelNumber: levelNumber,
            questions: questions
          };
        });
        updateData.levels = levels;
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

      console.log('Card updated successfully. Levels:', card.levels?.length || 0);
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
  '/:id/levels/:levelIndex/questions/:questionIndex/attachments',
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

      const levelIndex = parseInt(req.params.levelIndex);
      const questionIndex = parseInt(req.params.questionIndex);

      if (!card.levels || !card.levels[levelIndex]) {
        return res.status(404).json({ error: 'Level not found' });
      }

      if (!card.levels[levelIndex].questions || !card.levels[levelIndex].questions[questionIndex]) {
        return res.status(404).json({ error: 'Question not found' });
      }

      const newAttachment = {
        type: req.body.type,
        url: req.body.url,
        title: req.body.title
      };

      if (!card.levels[levelIndex].questions[questionIndex].attachments) {
        card.levels[levelIndex].questions[questionIndex].attachments = [];
      }

      card.levels[levelIndex].questions[questionIndex].attachments.push(newAttachment);
      await card.save();

      res.status(200).json(card);
    } catch (error) {
      console.error('Error adding attachment:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.delete('/:id/levels/:levelIndex/questions/:questionIndex/attachments/:attachmentId', authenticateToken, checkPermission('cards'), async (req, res) => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const levelIndex = parseInt(req.params.levelIndex);
    const questionIndex = parseInt(req.params.questionIndex);

    if (!card.levels || !card.levels[levelIndex] || !card.levels[levelIndex].questions || !card.levels[levelIndex].questions[questionIndex]) {
      return res.status(404).json({ error: 'Question not found' });
    }

    card.levels[levelIndex].questions[questionIndex].attachments = card.levels[levelIndex].questions[questionIndex].attachments.filter(
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

