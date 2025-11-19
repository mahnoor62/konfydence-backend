const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const PartnerLogo = require('../models/PartnerLogo');

const defaultPartnerLogos = [
  {
    name: 'SafeNet Alliance',
    logoUrl: 'https://dummyimage.com/220x90/ffffff/063c5e&text=SafeNet+Alliance',
    linkUrl: 'https://example.com/partners/safenet',
    type: 'partner',
  },
  {
    name: 'Digital Trust Forum',
    logoUrl: 'https://dummyimage.com/220x90/f0f6fb/0b7897&text=Digital+Trust',
    linkUrl: 'https://example.com/partners/dtf',
    type: 'partner',
  },
  {
    name: 'EU Cyber Coalition',
    logoUrl: 'https://dummyimage.com/220x90/e6f7ff/063c5e&text=EU+Cyber',
    linkUrl: 'https://example.com/partners/eu-cyber',
    type: 'partner',
  },
  {
    name: 'Nordic Security Week',
    logoUrl: 'https://dummyimage.com/220x90/fdf4e0/063c5e&text=Nordic+Security',
    linkUrl: 'https://example.com/partners/nordic-security-week',
    type: 'event',
  },
  {
    name: 'Parents for Digital Safety',
    logoUrl: 'https://dummyimage.com/220x90/fff7f1/0b7897&text=Digital+Safety',
    linkUrl: 'https://example.com/partners/parents-safety',
    type: 'partner',
  },
  {
    name: 'Future Skills Summit',
    logoUrl: 'https://dummyimage.com/220x90/edf7f3/063c5e&text=Future+Skills',
    linkUrl: 'https://example.com/partners/future-skills',
    type: 'event',
  },
];

async function ensureSeedPartners() {
  for (const partner of defaultPartnerLogos) {
    const existing = await PartnerLogo.findOne({ name: partner.name });
    if (!existing) {
      await PartnerLogo.create({ ...partner, isActive: true });
    } else {
      let needsUpdate = false;
      if (existing.logoUrl !== partner.logoUrl) {
        existing.logoUrl = partner.logoUrl;
        needsUpdate = true;
      }
      if (existing.linkUrl !== partner.linkUrl) {
        existing.linkUrl = partner.linkUrl;
        needsUpdate = true;
      }
      if (existing.type !== partner.type) {
        existing.type = partner.type;
        needsUpdate = true;
      }
      if (!existing.isActive) {
        existing.isActive = true;
        needsUpdate = true;
      }
      if (needsUpdate) {
        await existing.save();
      }
    }
  }
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await ensureSeedPartners();
    const { type } = req.query;
    const query = { isActive: true };
    if (type) {
      query.type = type;
    }
    const partners = await PartnerLogo.find(query).sort({ createdAt: -1 });
    res.json(partners);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  [
    body('name').notEmpty(),
    body('logoUrl').notEmpty(),
    body('type').isIn(['press', 'partner', 'event'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const partner = await PartnerLogo.create(req.body);
      res.status(201).json(partner);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const partner = await PartnerLogo.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!partner) {
      return res.status(404).json({ error: 'Partner logo not found' });
    }
    res.json(partner);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const partner = await PartnerLogo.findByIdAndDelete(req.params.id);
    if (!partner) {
      return res.status(404).json({ error: 'Partner logo not found' });
    }
    res.json({ message: 'Partner logo deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

