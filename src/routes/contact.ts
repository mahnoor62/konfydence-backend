import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import ContactMessage from '../models/ContactMessage';

const router = express.Router();

router.post(
  '/',
  [
    body('name').notEmpty(),
    body('email').isEmail(),
    body('topic').isIn(['b2b_demo', 'b2c_question', 'education', 'other']),
    body('message').notEmpty()
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const message = await ContactMessage.create(req.body);
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const message = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.json(message);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

