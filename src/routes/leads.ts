import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import B2BLead from '../models/B2BLead';
import EducationLead from '../models/EducationLead';

const router = express.Router();

router.post(
  '/b2b',
  [
    body('name').notEmpty(),
    body('company').notEmpty(),
    body('email').isEmail()
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const lead = await B2BLead.create(req.body);
      res.status(201).json(lead);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get('/b2b', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const leads = await B2BLead.find().sort({ createdAt: -1 });
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/b2b/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const lead = await B2BLead.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/education',
  [
    body('schoolName').notEmpty(),
    body('contactName').notEmpty(),
    body('email').isEmail(),
    body('role').notEmpty(),
    body('cityCountry').notEmpty()
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const lead = await EducationLead.create(req.body);
      res.status(201).json(lead);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get('/education', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const leads = await EducationLead.find().sort({ createdAt: -1 });
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/education/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const lead = await EducationLead.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

