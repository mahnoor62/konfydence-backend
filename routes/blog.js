const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const BlogPost = require('../models/BlogPost');

const router = express.Router();

const defaultBlogPosts = [
  {
    title: 'How Social Engineering Evolved in 2024',
    slug: 'social-engineering-2024',
    excerpt: 'The latest persuasion tactics scammers deploy—and how to counter them.',
    content: 'Full article content about social engineering trends.',
    category: 'insight',
    tags: ['Social Engineering', 'Awareness'],
    featuredImage: 'https://images.unsplash.com/photo-1525182008055-f88b95ff7980?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2024-02-02'),
  },
  {
    title: 'Identifying Latest Phishing Trends',
    slug: 'latest-phishing-trends',
    excerpt: 'Spot the red flags inside AI-powered phishing lures before your team clicks.',
    content: 'Full article content about phishing trends.',
    category: 'technique',
    tags: ['Phishing', 'Security'],
    featuredImage: 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2024-01-24'),
  },
  {
    title: 'Checklist for Avoiding Online Scams',
    slug: 'online-scam-checklist',
    excerpt: 'Use this checklist before you click pay on unfamiliar websites.',
    content: 'Full article content with checklist items.',
    category: 'checklist',
    tags: ['Checklist', 'Consumers'],
    featuredImage: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2024-01-15'),
  },
  {
    title: '10 Tips for Safe Online Shopping',
    slug: 'safe-online-shopping-tips',
    excerpt: 'Practical guidance for protecting your wallet during big retail events.',
    content: 'Full article content with 10 tips.',
    category: 'guide',
    tags: ['Shopping', 'Families'],
    featuredImage: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2024-01-05'),
  },
  {
    title: 'Ransomware Readiness for SMEs',
    slug: 'ransomware-readiness-sme',
    excerpt: 'Step-by-step playbook to prepare your incident response.',
    content: 'Full article on ransomware readiness.',
    category: 'guide',
    tags: ['Ransomware', 'SMB'],
    featuredImage: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-12-18'),
  },
  {
    title: 'How to Run Tabletop Exercises',
    slug: 'tabletop-exercises',
    excerpt: 'Make compliance drills engaging and aligned with NIS2.',
    content: 'Full article about tabletop exercises.',
    category: 'technique',
    tags: ['Compliance', 'Training'],
    featuredImage: 'https://images.unsplash.com/photo-1504805572947-34fad45aed93?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-12-05'),
  },
  {
    title: 'Mobile Scam Red Flags for Teens',
    slug: 'mobile-scam-red-flags',
    excerpt: 'Give your teens the questions to ask before sharing data.',
    content: 'Full article about mobile scams.',
    category: 'insight',
    tags: ['Youth', 'Mobile'],
    featuredImage: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-11-20'),
  },
  {
    title: 'Quarterly Threat Briefing Template',
    slug: 'threat-briefing-template',
    excerpt: 'A plug-and-play template for presenting threat intel to leadership.',
    content: 'Full article with template details.',
    category: 'template',
    tags: ['Leadership', 'Reporting'],
    featuredImage: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-11-01'),
  },
  {
    title: 'Building a Scam-Resistant Culture',
    slug: 'scam-resistant-culture',
    excerpt: 'Culture change tactics used by top-performing compliance teams.',
    content: 'Full article on culture building.',
    category: 'insight',
    tags: ['Culture', 'Compliance'],
    featuredImage: 'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-10-20'),
  },
  {
    title: 'Ultimate Glossary of Fraud Buzzwords',
    slug: 'fraud-buzzwords-glossary',
    excerpt: 'Translate the jargon scammers use so your staff stays ahead.',
    content: 'Full article glossary.',
    category: 'reference',
    tags: ['Glossary', 'Training'],
    featuredImage: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-10-05'),
  },
  {
    title: 'When AI Chatbots Go Rogue',
    slug: 'ai-chatbots-go-rogue',
    excerpt: 'Emerging AI scams that impersonate your colleagues in seconds.',
    content: 'Full article about AI chatbot scams.',
    category: 'insight',
    tags: ['AI', 'Impersonation'],
    featuredImage: 'https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-09-18'),
  },
  {
    title: "The Parent's Guide to Deepfake Calls",
    slug: 'parents-guide-deepfake-calls',
    excerpt: 'Questions to ask if your child calls for "urgent" help.',
    content: 'Full article about deepfake phone scams.',
    category: 'guide',
    tags: ['Families', 'Deepfake'],
    featuredImage: 'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-09-05'),
  },
  {
    title: 'Quarterly Security Awareness Agenda',
    slug: 'security-awareness-agenda',
    excerpt: 'Reuse this agenda to run engaging company-wide awareness days.',
    content: 'Full article with agenda and talking points.',
    category: 'template',
    tags: ['Agenda', 'Awareness'],
    featuredImage: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-08-25'),
  },
  {
    title: 'SMS Smishing Patterns to Teach Employees',
    slug: 'sms-smishing-patterns',
    excerpt: 'Common structures of text scams and how to dissect them.',
    content: 'Full article about smishing education.',
    category: 'technique',
    tags: ['SMS', 'Training'],
    featuredImage: 'https://images.unsplash.com/photo-1512499617640-c2f999098c01?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-08-10'),
  },
  {
    title: 'Launch a Scam Hotline in 7 Days',
    slug: 'scam-hotline-seven-days',
    excerpt: 'Checklist for piloting an internal hotline that employees trust.',
    content: 'Full article describing hotline rollout.',
    category: 'checklist',
    tags: ['Hotline', 'Operations'],
    featuredImage: 'https://images.unsplash.com/photo-1517430816045-df4b7de11d1d?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-07-30'),
  },
  {
    title: 'Playbook: Communicating Breaches to Parents',
    slug: 'communicating-breaches-parents',
    excerpt: 'Templates schools can use when student data is exposed.',
    content: 'Full article with communication templates.',
    category: 'guide',
    tags: ['Schools', 'Crisis Comms'],
    featuredImage: 'https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-07-15'),
  },
  {
    title: 'Finance Team Recon Checklist',
    slug: 'finance-team-recon-checklist',
    excerpt: 'Use this before approving unusual vendor payments.',
    content: 'Full article with finance checklist.',
    category: 'checklist',
    tags: ['Finance', 'Fraud'],
    featuredImage: 'https://images.unsplash.com/photo-1454165205744-3b78555e5572?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-07-01'),
  },
  {
    title: 'How to Gamify Security Trainings',
    slug: 'gamify-security-trainings',
    excerpt: 'Turn dull trainings into collaborative experiences.',
    content: 'Full article on gamification techniques.',
    category: 'insight',
    tags: ['Gamification', 'Training'],
    featuredImage: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-06-15'),
  },
  {
    title: 'Board Q&A: Scam Metrics That Matter',
    slug: 'board-qa-scam-metrics',
    excerpt: 'Answer the top five questions boards ask during cyber briefings.',
    content: 'Full article with Q&A format.',
    category: 'reference',
    tags: ['Board', 'Metrics'],
    featuredImage: 'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-06-01'),
  },
  {
    title: 'Weekend Family Cyber Drills',
    slug: 'weekend-family-cyber-drills',
    excerpt: 'Short activities parents can run during dinner.',
    content: 'Full article describing drills.',
    category: 'guide',
    tags: ['Families', 'Activities'],
    featuredImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
    isPublished: true,
    publishedAt: new Date('2023-05-20'),
  },
];

async function ensureSeedBlogs() {
  for (const post of defaultBlogPosts) {
    const existing = await BlogPost.findOne({ slug: post.slug });
    if (!existing) {
      await BlogPost.create(post);
    }
  }
}

router.get('/', async (req, res) => {
  try {
    await ensureSeedBlogs();
    const { page = 1, limit = 10, published, all } = req.query;
    const query = {};
    const fetchAll = all === 'true';
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(parseInt(limit, 10) || 10, 1);
    
    if (published === 'true') {
      query.isPublished = true;
      query.publishedAt = { $lte: new Date() };
    }

    if (fetchAll) {
      const posts = await BlogPost.find(query).sort({ publishedAt: -1, createdAt: -1 });
      return res.json({
        posts,
        total: posts.length,
        page: 1,
        pages: 1,
        limit: posts.length,
      });
    }

    const [posts, total] = await Promise.all([
      BlogPost.find(query)
        .sort({ publishedAt: -1, createdAt: -1 })
        .limit(limitNumber)
        .skip((pageNumber - 1) * limitNumber),
      BlogPost.countDocuments(query),
    ]);

    res.json({
      posts,
      total,
      page: pageNumber,
      pages: Math.max(1, Math.ceil(total / limitNumber)),
      limit: limitNumber,
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post(
  '/',
  authenticateToken,
  [
    body('title').notEmpty(),
    body('slug').notEmpty(),
    body('excerpt').notEmpty(),
    body('content').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (req.body.isPublished && !req.body.publishedAt) {
        req.body.publishedAt = new Date();
      }

      const post = await BlogPost.create(req.body);
      res.status(201).json(post);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Blog post slug already exists' });
      }
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.body.isPublished && !req.body.publishedAt) {
      req.body.publishedAt = new Date();
    }

    const post = await BlogPost.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndDelete(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

