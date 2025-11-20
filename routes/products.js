const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const Product = require('../models/Product');

const defaultProducts = [
  {
    name: 'Scam Survival Starter Kit',
    slug: 'scam-survival-starter-kit',
    description: 'Interactive card decks and mini missions that teach families how to spot the latest scam tactics.',
    price: 49,
    type: 'starter',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1601597111158-2fceff292cdc?auto=format&fit=crop&w=900&q=80',
    badges: ['New', 'Family'],
    sortOrder: 1,
    category: 'private-users',
    ctaText: 'Shop Starter Kit',
    ctaHref: '/shop?product=scam-survival-starter-kit',
    pricingInfo: {
      primary: '€49 one-time',
      secondary: 'Includes 90-day challenge'
    }
  },
  {
    name: 'Family Shield Bundle',
    slug: 'family-shield-bundle',
    description: 'Weekend-ready missions, screen-safe habit trackers, and scam role-play scripts for parents.',
    price: 89,
    type: 'bundle',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1507668077129-56e32842fceb?auto=format&fit=crop&w=900&q=80',
    badges: ['Best Seller'],
    sortOrder: 2,
    category: 'private-users',
    ctaText: 'Explore Bundle',
    ctaHref: '/shop?product=family-shield-bundle',
    pricingInfo: {
      primary: '€89 bundle',
      secondary: 'Save 15% vs separate kits'
    }
  },
  {
    name: 'Schools Media Literacy Pack',
    slug: 'schools-media-literacy-pack',
    description: 'Ready-to-teach lessons, facilitator guides, and student worksheets aligned with EU media literacy goals.',
    price: 499,
    type: 'bundle',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=900&q=80',
    badges: ['Schools'],
    sortOrder: 3,
    category: 'schools',
    ctaText: 'Schedule Demo',
    ctaHref: '/education',
    pricingInfo: {
      primary: 'from €499/year',
      secondary: 'Up to 250 students'
    }
  },
  {
    name: 'Comasy Lab Membership',
    slug: 'comasy-lab-membership',
    description: 'Monthly drop-in labs where employees practice phishing response, vishing detection, and fraud escalation.',
    price: 29,
    type: 'membership',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80',
    badges: ['B2B'],
    sortOrder: 4,
    category: 'businesses',
    ctaText: 'Request Demo',
    ctaHref: '/contact?topic=b2b_demo',
    pricingInfo: {
      primary: 'from €29/employee',
      secondary: 'Billed annually'
    }
  },
  {
    name: 'NIS2 Compliance Sprint',
    slug: 'nis2-compliance-sprint',
    description: 'Six-week enablement sprint covering phishing, social engineering, and policy drills for leadership teams.',
    price: 3490,
    type: 'bundle',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=900&q=80',
    badges: ['Compliance'],
    sortOrder: 5,
    category: 'businesses',
    ctaText: 'Book Consultation',
    ctaHref: '/contact?topic=b2b_demo',
    pricingInfo: {
      primary: '€3,490 flat',
      secondary: 'Includes reporting kit'
    }
  },
  {
    name: 'Cyber Scouts Classroom Edition',
    slug: 'cyber-scouts-classroom',
    description: 'Gamified classroom missions with facilitator dashboards and student leaderboards.',
    price: 1299,
    type: 'bundle',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1495578942200-c57c41614780?auto=format&fit=crop&w=900&q=80',
    badges: ['Interactive'],
    sortOrder: 6,
    category: 'schools',
    ctaText: 'Request Pilot',
    ctaHref: '/education',
    pricingInfo: {
      primary: 'from €1,299/year',
      secondary: 'Covers 3 grade levels'
    }
  },
  {
    name: 'Executive Phishing Simulator',
    slug: 'executive-phishing-simulator',
    description: 'Live-fire phishing scenarios for executives with bespoke reporting and coaching.',
    price: 1890,
    type: 'bundle',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=900&q=80',
    badges: ['Leadership'],
    sortOrder: 7,
    category: 'businesses',
    ctaText: 'Book Session',
    ctaHref: '/contact?topic=b2b_demo',
    pricingInfo: {
      primary: '€1,890 engagement',
      secondary: 'Up to 15 leaders'
    }
  },
  {
    name: 'Neighborhood Scam Watch Kit',
    slug: 'neighborhood-scam-watch',
    description: 'Community-ready starter kit with posters, WhatsApp templates, and local facilitator scripts.',
    price: 59,
    type: 'starter',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=900&q=80',
    badges: ['Community'],
    sortOrder: 8,
    category: 'private-users',
    ctaText: 'Buy Kit',
    ctaHref: '/shop?product=neighborhood-scam-watch',
    pricingInfo: {
      primary: '€59 kit',
      secondary: 'Ships worldwide'
    }
  },
  {
    name: 'Fraud Response Playbook',
    slug: 'fraud-response-playbook',
    description: 'Step-by-step playbook with templates for social, finance, and legal teams.',
    price: 790,
    type: 'starter',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=900&q=80',
    badges: ['Template'],
    sortOrder: 9,
    category: 'businesses',
    ctaText: 'Download Pack',
    ctaHref: '/shop?product=fraud-response-playbook',
    pricingInfo: {
      primary: '€790 one-time',
      secondary: 'Includes update plan'
    }
  },
  {
    name: 'Board Cyber Readiness Briefing',
    slug: 'board-cyber-readiness',
    description: '90-minute facilitated briefing with scenario walkthroughs and compliance scorecard.',
    price: 2400,
    type: 'bundle',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=900&q=80',
    badges: ['Leadership'],
    sortOrder: 10,
    category: 'businesses',
    ctaText: 'Book Briefing',
    ctaHref: '/contact?topic=b2b_demo',
    pricingInfo: {
      primary: '€2,400 session',
      secondary: 'Includes summary deck'
    }
  },
  {
    name: 'Scam Survival Membership',
    slug: 'scam-survival-membership',
    description: 'Rolling release of new scams, texting templates, and live Q&A calls for families.',
    price: 12,
    type: 'membership',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80',
    badges: ['Monthly'],
    sortOrder: 11,
    category: 'private-users',
    ctaText: 'Join Now',
    ctaHref: '/shop?product=scam-survival-membership',
    pricingInfo: {
      primary: '€12/month',
      secondary: 'Cancel anytime'
    }
  },
  {
    name: 'Rapid Response Hotline Retainer',
    slug: 'rapid-response-hotline',
    description: 'Priority hotline for finance teams handling live fraud escalations and customer comms.',
    price: 990,
    type: 'membership',
    isActive: true,
    imageUrl: 'https://images.unsplash.com/photo-1485217988980-11786ced9454?auto=format&fit=crop&w=900&q=80',
    badges: ['On-Call'],
    sortOrder: 12,
    category: 'businesses',
    ctaText: 'Talk to Sales',
    ctaHref: '/contact?topic=b2b_demo',
    pricingInfo: {
      primary: 'from €990/month',
      secondary: 'Custom SLAs'
    }
  }
];

const placeholderImage =
  'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=900&q=80';

async function ensureSeedProducts() {
  for (const product of defaultProducts) {
    const existing = await Product.findOne({ slug: product.slug });
    if (!existing) {
      await Product.create(product);
      continue;
    }

    const needsImageUpdate =
      !existing.imageUrl ||
      existing.imageUrl.startsWith('/') ||
      !existing.imageUrl.startsWith('http');

    if (needsImageUpdate) {
      existing.imageUrl = product.imageUrl;
      await existing.save();
    }
  }

  await Product.updateMany(
    {
      $or: [
        { imageUrl: { $exists: false } },
        { imageUrl: { $eq: '' } },
        { imageUrl: null },
        { imageUrl: ' ' },
      ],
    },
    { imageUrl: placeholderImage }
  );
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await ensureSeedProducts();

    const pageParam = parseInt(req.query.page, 10);
    const limitParam = parseInt(req.query.limit, 10);
    const includeInactive = req.query.includeInactive === 'true';
    const skipPagination = req.query.all === 'true';
    const shouldPaginate = !skipPagination && (!Number.isNaN(pageParam) || !Number.isNaN(limitParam));
    const query = includeInactive ? {} : { isActive: true };

    if (shouldPaginate) {
      const page = Number.isNaN(pageParam) ? 1 : Math.max(pageParam, 1);
      const limitBase = Number.isNaN(limitParam) ? 10 : limitParam;
      const limit = Math.min(Math.max(limitBase, 1), 50);
      const [products, total] = await Promise.all([
        Product.find(query)
          .sort({ sortOrder: 1, createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Product.countDocuments(query)
      ]);

      const totalPages = Math.max(1, Math.ceil(total / limit));

      return res.json({
        products,
        total,
        page,
        totalPages,
        limit
      });
    }

    const products = await Product.find(query).sort({ sortOrder: 1, createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/featured/homepage', async (req, res) => {
  try {
    let featuredProducts = await Product.find({ 
      isFeatured: true,
      category: { $in: ['private-users', 'schools', 'businesses'] }
    }).sort({ sortOrder: 1 });

    if (featuredProducts.length < 3) {
      const defaultProducts = [
        {
          name: 'Private Users',
          slug: 'private-users',
          description: 'Perfect for individuals and families to boost personal security awareness.',
          price: 49,
          type: 'starter',
          isActive: true,
          imageUrl: '/images/private-users.jpg',
          sortOrder: 1,
          isFeatured: true,
          category: 'private-users',
          ctaText: 'Visit the Shop',
          ctaHref: '/shop',
          buttonColor: '#FFD700',
          pricingInfo: {
            label: 'Starter Kit',
            primary: '€49 One-time',
            secondary: 'from €59/year'
          }
        },
        {
          name: 'Schools',
          slug: 'schools',
          description: 'Empower students with our engaging digital security curriculum.',
          price: 499,
          type: 'bundle',
          isActive: true,
          imageUrl: '/images/schools.jpg',
          sortOrder: 2,
          isFeatured: true,
          category: 'schools',
          ctaText: 'Request Info Material',
          ctaHref: '/education',
          buttonColor: '#0B7897',
          pricingInfo: {
            primary: 'from €499/year',
            secondary: 'Institutional license'
          }
        },
        {
          name: 'Businesses',
          slug: 'businesses',
          description: 'Protect your team and ensure compliance with NIS2 standards.',
          price: 19,
          type: 'membership',
          isActive: true,
          imageUrl: '/images/businesses.jpg',
          sortOrder: 3,
          isFeatured: true,
          category: 'businesses',
          ctaText: 'Request Demo & Pricing',
          ctaHref: '/contact?topic=b2b_demo',
          buttonColor: '#063C5E',
          pricingInfo: {
            label: 'Compliance Licenses',
            primary: 'from €19/employee/year'
          }
        }
      ];

      for (const product of defaultProducts) {
        const existing = await Product.findOne({ slug: product.slug });
        if (!existing) {
          await Product.create(product);
        } else {
          await Product.findByIdAndUpdate(
            existing._id,
            {
              ...product,
              isFeatured: true,
            },
            { new: true, runValidators: true }
          );
        }
      }

      featuredProducts = await Product.find({ 
        isFeatured: true,
        category: { $in: ['private-users', 'schools', 'businesses'] }
      }).sort({ sortOrder: 1 });
    }

    res.json(featuredProducts);
  } catch (error) {
    console.error('Error fetching featured products:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/slug/:slug', async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, isActive: true });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  [
    body('name').notEmpty(),
    body('slug').notEmpty(),
    body('description').notEmpty(),
    body('price').isNumeric(),
    body('type').isIn(['starter', 'bundle', 'membership']),
    body('imageUrl').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const product = await Product.create(req.body);
      res.status(201).json(product);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Product slug already exists' });
      }
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put(
  '/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const product = await Product.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json(product);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;


