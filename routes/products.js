const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const Product = require('../models/Product');


const router = express.Router();

router.get('/', optionalAuth, async (req, res) => {
  try {
    const pageParam = parseInt(req.query.page, 10);
    const limitParam = parseInt(req.query.limit, 10);
    const includeInactive = req.query.includeInactive === 'true';
    const skipPagination = req.query.all === 'true';
    const shouldPaginate = !skipPagination && (!Number.isNaN(pageParam) || !Number.isNaN(limitParam));
    
    // Get user info from token if available (for private products)
    const userId = req.user?.userId;
    const userOrganizationId = req.user?.organizationId;
    const userSchoolId = req.user?.schoolId;
    
    // If includeInactive=true, show all products (active + inactive)
    // Otherwise, default to showing only active products
    const query = includeInactive ? {} : { isActive: true };

    if (req.query.type) {
      query.type = req.query.type;
    }

    if (req.query.category) {
      query.category = req.query.category;
    }

    // Filter by visibility: public products OR private products where user's org/institute is allowed
    // For admin panel (when includeInactive=true and all=true), show ALL products regardless of visibility
    if (includeInactive && skipPagination) {
      // Admin panel - show all products (public and private)
      // Don't filter by visibility
    } else if (!userId) {
      // No user logged in - only show public products
      query.visibility = 'public';
    } else {
      // User logged in - show public products OR private products they have access to
      query.$or = [
        { visibility: 'public' },
        {
          visibility: 'private',
          $or: [
            { allowedOrganizations: userOrganizationId },
            { allowedInstitutes: userSchoolId }
          ]
        }
      ];
    }

    if (shouldPaginate) {
      const page = Number.isNaN(pageParam) ? 1 : Math.max(pageParam, 1);
      const limitBase = Number.isNaN(limitParam) ? 10 : limitParam;
      const limit = Math.min(Math.max(limitBase, 1), 50);
      const [products, total] = await Promise.all([
        Product.find(query)
          .populate('allowedOrganizations', 'name')
          .populate('allowedInstitutes', 'name')
          .sort({ createdAt: -1 })
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

    const products = await Product.find(query)
      .populate('cardIds', 'title category levels referenceCode')
      .populate('level1', 'title category targetAudiences tags')
      .populate('level2', 'title category targetAudiences tags')
      .populate('level3', 'title category targetAudiences tags')
      .populate('allowedOrganizations', 'name')
      .populate('allowedInstitutes', 'name')
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/featured/homepage', optionalAuth, async (req, res) => {
  try {
    // Only show public featured products on homepage
    const featuredProducts = await Product.find({ 
      isFeatured: true,
      isActive: true,
      visibility: 'public',
      category: { $in: ['private-users', 'schools', 'businesses'] }
    }).sort({ createdAt: -1 }).limit(6);

    res.json(featuredProducts);
  } catch (error) {
    console.error('Error fetching featured products:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/slug/:slug', optionalAuth, async (req, res) => {
  try {
    // Get user info from token if available
    const userId = req.user?.userId;
    const userOrganizationId = req.user?.organizationId;
    const userSchoolId = req.user?.schoolId;
    
    let query = { slug: req.params.slug, isActive: true };
    
    // Filter by visibility
    if (!userId) {
      // No user logged in - only show public products
      query.visibility = 'public';
    } else {
      // User logged in - show public products OR private products they have access to
      query.$or = [
        { visibility: 'public' },
        {
          visibility: 'private',
          $or: [
            { allowedOrganizations: userOrganizationId },
            { allowedInstitutes: userSchoolId }
          ]
        }
      ];
    }
    
    const product = await Product.findOne(query)
      .populate('cardIds', 'title category levels referenceCode')
      .populate('level1', 'title category targetAudiences tags')
      .populate('level2', 'title category targetAudiences tags')
      .populate('level3', 'title category targetAudiences tags')
      .populate('allowedOrganizations', 'name')
      .populate('allowedInstitutes', 'name');
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    console.error('Error fetching product by slug:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('cardIds', 'title category levels referenceCode')
      .populate('level1', 'title category targetAudiences tags')
      .populate('level2', 'title category targetAudiences tags')
      .populate('level3', 'title category targetAudiences tags');
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper function to generate slug from name
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

router.post(
  '/',
  authenticateToken,
  [
    body('name').notEmpty().withMessage('Product name is required'),
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

      // Generate slug from name
      let baseSlug = generateSlug(req.body.name);
      let slug = baseSlug;
      let counter = 1;
      
      // Ensure slug is unique
      while (await Product.findOne({ slug })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      // Ensure targetAudience is saved if provided
      const productData = { 
        ...req.body,
        slug: slug,
        // Remove sortOrder if present
        sortOrder: undefined
      };
      
      if (productData.targetAudience) {
        // Validate targetAudience value
        const validTargetAudiences = ['private-users', 'schools', 'businesses'];
        if (!validTargetAudiences.includes(productData.targetAudience)) {
          return res.status(400).json({ error: 'Invalid targetAudience. Must be one of: private-users, schools, businesses' });
        }
      }

      // Ensure level arrays are arrays
      if (!Array.isArray(productData.level1)) productData.level1 = [];
      if (!Array.isArray(productData.level2)) productData.level2 = [];
      if (!Array.isArray(productData.level3)) productData.level3 = [];

      const product = await Product.create(productData);
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

      // Get existing product to check if name changed
      const existingProduct = await Product.findById(req.params.id);
      if (!existingProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Ensure targetAudience is saved if provided
      const updateData = { ...req.body };
      
      // Remove sortOrder if present
      delete updateData.sortOrder;
      
      // Generate slug if name changed
      if (updateData.name && updateData.name !== existingProduct.name) {
        let baseSlug = generateSlug(updateData.name);
        let slug = baseSlug;
        let counter = 1;
        
        // Ensure slug is unique (excluding current product)
        while (await Product.findOne({ slug, _id: { $ne: req.params.id } })) {
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
        updateData.slug = slug;
      }
      
      if (updateData.targetAudience) {
        // Validate targetAudience value
        const validTargetAudiences = ['private-users', 'schools', 'businesses'];
        if (!validTargetAudiences.includes(updateData.targetAudience)) {
          return res.status(400).json({ error: 'Invalid targetAudience. Must be one of: private-users, schools, businesses' });
        }
      }

      // Ensure level arrays are arrays
      if (updateData.level1 !== undefined && !Array.isArray(updateData.level1)) updateData.level1 = [];
      if (updateData.level2 !== undefined && !Array.isArray(updateData.level2)) updateData.level2 = [];
      if (updateData.level3 !== undefined && !Array.isArray(updateData.level3)) updateData.level3 = [];
      
      // Ensure visibility defaults to public if not provided
      if (!updateData.visibility) updateData.visibility = 'public';
      
      // Clear allowed arrays if visibility is public
      if (updateData.visibility === 'public') {
        updateData.allowedOrganizations = [];
        updateData.allowedInstitutes = [];
      } else {
        // Ensure allowed arrays are arrays
        if (updateData.allowedOrganizations !== undefined && !Array.isArray(updateData.allowedOrganizations)) {
          updateData.allowedOrganizations = [];
        }
        if (updateData.allowedInstitutes !== undefined && !Array.isArray(updateData.allowedInstitutes)) {
          updateData.allowedInstitutes = [];
        }
      }

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        updateData,
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



