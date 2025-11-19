import express, { Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import SiteSettings from '../models/SiteSettings';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    let settings = await SiteSettings.findOne();
    if (!settings) {
      settings = await SiteSettings.create({});
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    let settings = await SiteSettings.findOne();
    if (!settings) {
      settings = await SiteSettings.create(req.body);
    } else {
      settings = await SiteSettings.findOneAndUpdate(
        {},
        req.body,
        { new: true, upsert: true }
      );
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

