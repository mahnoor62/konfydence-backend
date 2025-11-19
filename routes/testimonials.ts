import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import Testimonial from '../models/Testimonial';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { segment } = req.query;
    const query: any = { isActive: true };
    if (segment) {
      query.segment = segment;
    }
    const testimonials = await Testimonial.find(query).sort({ createdAt: -1 });
    res.json(testimonials);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  [
    body('name').notEmpty(),
    body('role').notEmpty(),
    body('organization').notEmpty(),
    body('quote').notEmpty(),
    body('segment').isIn(['b2b', 'b2c', 'b2e'])
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const testimonial = await Testimonial.create(req.body);
      res.status(201).json(testimonial);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const testimonial = await Testimonial.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!testimonial) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }
    res.json(testimonial);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const testimonial = await Testimonial.findByIdAndDelete(req.params.id);
    if (!testimonial) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }
    res.json({ message: 'Testimonial deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

