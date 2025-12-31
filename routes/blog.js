const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const BlogPost = require('../models/BlogPost');

const router = express.Router();

// Helper function to generate slug from title
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

// Helper function to ensure unique slug
const ensureUniqueSlug = async (baseSlug, excludeId = null) => {
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const query = { slug };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    
    const existing = await BlogPost.findOne(query);
    if (!existing) {
      return slug;
    }
    
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
};


router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, published, all, category, search } = req.query;
    const query = {};
    const fetchAll = all === 'true';
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(parseInt(limit, 10) || 10, 1);
    
    // Only filter by published if specifically requested
    // For admin panel (all=true), show all posts regardless of published status
    if (published === 'true' && !fetchAll) {
      query.isPublished = true;
      query.publishedAt = { $lte: new Date() };
    }

    if (category) {
      query.category = category;
    }

    // Search functionality
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { excerpt: searchRegex },
        { content: searchRegex },
        { description: searchRegex },
      ];
    }

    if (fetchAll) {
      // Admin panel: fetch all posts (published and drafts)
      // Sort by createdAt first (most recent), then by publishedAt if available
      const posts = await BlogPost.find(query)
        .sort({ 
          createdAt: -1,  // Most recently created first
          publishedAt: -1 // Then by published date
        })
        .lean(); // Use lean() for better performance
      
      return res.json({
        posts: posts || [],
        total: posts?.length || 0,
        page: 1,
        pages: 1,
        limit: posts?.length || 0,
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
    console.error('Error fetching blog posts:', error);
    res.status(500).json({ error: 'Failed to fetch blog posts' });
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
    body('title').notEmpty().withMessage('Post title is required'),
    body('excerpt').notEmpty().withMessage('Post excerpt is required'),
    body('content').notEmpty().withMessage('Post content is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg).join(', ');
        return res.status(400).json({ error: errorMessages, errors: errors.array() });
      }

      if (!req.body.category) {
        return res.status(400).json({ error: 'Post category is required' });
      }

      // Auto-generate slug from title if not provided
      if (!req.body.slug || !req.body.slug.trim()) {
        const baseSlug = generateSlug(req.body.title);
        req.body.slug = await ensureUniqueSlug(baseSlug);
      } else {
        // If slug is provided, ensure it's unique
        req.body.slug = await ensureUniqueSlug(req.body.slug);
      }

      if (req.body.isPublished && !req.body.publishedAt) {
        req.body.publishedAt = new Date();
      }

      const post = await BlogPost.create(req.body);
      res.status(201).json(post);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Blog post slug already exists. Please use a different slug.' });
      }
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err) => err.message).join(', ');
        return res.status(400).json({ error: validationErrors });
      }
      console.error('Error creating blog post:', error);
      res.status(500).json({ error: 'Failed to create blog post. Please try again.' });
    }
  }
);

router.put(
  '/:id',
  authenticateToken,
  [
    body('title').optional().notEmpty().withMessage('Post title cannot be empty'),
    body('excerpt').optional().notEmpty().withMessage('Post excerpt cannot be empty'),
    body('content').optional().notEmpty().withMessage('Post content cannot be empty')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg).join(', ');
        return res.status(400).json({ error: errorMessages, errors: errors.array() });
      }

      // Auto-generate slug from title if title is being updated and slug is not provided
      if (req.body.title && (!req.body.slug || !req.body.slug.trim())) {
        const baseSlug = generateSlug(req.body.title);
        req.body.slug = await ensureUniqueSlug(baseSlug, req.params.id);
      } else if (req.body.slug && req.body.slug.trim()) {
        // If slug is provided, ensure it's unique (excluding current post)
        req.body.slug = await ensureUniqueSlug(req.body.slug, req.params.id);
      }

      if (req.body.isPublished && !req.body.publishedAt) {
        req.body.publishedAt = new Date();
      }

      const post = await BlogPost.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      if (!post) {
        return res.status(404).json({ error: 'Blog post not found' });
      }
      res.json(post);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Blog post slug already exists. Please use a different slug.' });
      }
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err) => err.message).join(', ');
        return res.status(400).json({ error: validationErrors });
      }
      console.error('Error updating blog post:', error);
      res.status(500).json({ error: 'Failed to update blog post. Please try again.' });
    }
  }
);

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Attempting to delete blog post with ID:', id);
    
    const post = await BlogPost.findByIdAndDelete(id);
    if (!post) {
      console.log('Blog post not found with ID:', id);
      return res.status(404).json({ error: 'Blog post not found' });
    }
    console.log('Blog post deleted successfully:', post.title);
    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({ error: 'Failed to delete blog post. Please try again.' });
  }
});

module.exports = router;

