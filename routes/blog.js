const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const BlogPost = require('../models/BlogPost');

const router = express.Router();


router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, published, all, category } = req.query;
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
    body('slug').notEmpty().withMessage('Post slug is required'),
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
    body('slug').optional().notEmpty().withMessage('Post slug cannot be empty'),
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

