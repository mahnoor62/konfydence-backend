const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const Product = require('../models/Product');


const router = express.Router();

router.get('/', async (req, res) => {
  try {

    const pageParam = parseInt(req.query.page, 10);
    const limitParam = parseInt(req.query.limit, 10);
    const includeInactive = req.query.includeInactive === 'true';
    const skipPagination = req.query.all === 'true';
    const shouldPaginate = !skipPagination && (!Number.isNaN(pageParam) || !Number.isNaN(limitParam));
    // If includeInactive=true, show all products (active + inactive)
    // Otherwise, default to showing only active products
    const query = includeInactive ? {} : { isActive: true };

    if (req.query.type) {
      query.type = req.query.type;
    }

    if (req.query.category) {
      query.category = req.query.category;
    }

    if (shouldPaginate) {
      const page = Number.isNaN(pageParam) ? 1 : Math.max(pageParam, 1);
      const limitBase = Number.isNaN(limitParam) ? 10 : limitParam;
      const limit = Math.min(Math.max(limitBase, 1), 50);
      const [products, total] = await Promise.all([
        Product.find(query)
          .sort({ createdAt: -1, sortOrder: 1 })
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

    const products = await Product.find(query).sort({ createdAt: -1, sortOrder: 1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/featured/homepage', async (req, res) => {
  try {
    const featuredProducts = await Product.find({ 
      isFeatured: true,
      isActive: true,
      category: { $in: ['private-users', 'schools', 'businesses'] }
    }).sort({ sortOrder: 1, createdAt: -1 }).limit(6);

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
    body('name').notEmpty().withMessage('Product name is required'),
    body('slug').notEmpty().withMessage('Product slug is required'),
    body('description').notEmpty().withMessage('Product description is required'),
    body('price').isNumeric().withMessage('Product price must be a valid number'),
    body('imageUrl').notEmpty().withMessage('Product image is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg).join(', ');
        return res.status(400).json({ error: errorMessages, errors: errors.array() });
      }

      if (!req.body.type) {
        return res.status(400).json({ error: 'Product type is required' });
      }

      const product = await Product.create(req.body);
      res.status(201).json(product);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Product slug already exists. Please use a different slug.' });
      }
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err) => err.message).join(', ');
        return res.status(400).json({ error: validationErrors });
      }
      console.error('Error creating product:', error);
      res.status(500).json({ error: 'Failed to create product. Please try again.' });
    }
  }
);

router.put(
  '/:id',
  authenticateToken,
  [
    body('name').optional().notEmpty().withMessage('Product name cannot be empty'),
    body('slug').optional().notEmpty().withMessage('Product slug cannot be empty'),
    body('description').optional().notEmpty().withMessage('Product description cannot be empty'),
    body('price').optional().isNumeric().withMessage('Product price must be a valid number'),
    body('imageUrl').optional().notEmpty().withMessage('Product image URL cannot be empty')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg).join(', ');
        return res.status(400).json({ error: errorMessages, errors: errors.array() });
      }

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
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Product slug already exists. Please use a different slug.' });
      }
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err) => err.message).join(', ');
        return res.status(400).json({ error: validationErrors });
      }
      console.error('Error updating product:', error);
      res.status(500).json({ error: 'Failed to update product. Please try again.' });
    }
  }
);

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product. Please try again.' });
  }
});

module.exports = router;



