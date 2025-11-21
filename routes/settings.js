const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const SiteSettings = require('../models/SiteSettings');

const router = express.Router();

router.get('/', async (req, res) => {
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

router.put('/', authenticateToken, async (req, res) => {
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

module.exports = router;



