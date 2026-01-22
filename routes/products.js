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

    // Filter by targetAudience (can be array or single value)
    if (req.query.targetAudience) {
      // targetAudience is stored as an array in the database
      // So we need to check if the array contains the requested value
      query.targetAudience = { $in: Array.isArray(req.query.targetAudience) ? req.query.targetAudience : [req.query.targetAudience] };
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
          .populate('level1', 'title category targetAudiences tags')
          .populate('level2', 'title category targetAudiences tags')
          .populate('level3', 'title category targetAudiences tags')
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
      .populate('allowedOrganizations', 'name')
      .populate('allowedInstitutes', 'name')
      .populate('level1', 'title category targetAudiences tags')
      .populate('level2', 'title category targetAudiences tags')
      .populate('level3', 'title category targetAudiences tags')
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/featured/homepage', optionalAuth, async (req, res) => {
  try {
    // Only show public active products on homepage
    const featuredProducts = await Product.find({ 
      isActive: true,
      visibility: 'public',
      targetAudience: { $in: ['private-users', 'schools', 'businesses'] }
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
      .populate('allowedOrganizations', 'name')
      .populate('allowedInstitutes', 'name')
      .populate('level1', 'title category targetAudiences tags')
      .populate('level2', 'title category targetAudiences tags')
      .populate('level3', 'title category targetAudiences tags');
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
      .populate('allowedOrganizations', 'name')
      .populate('allowedInstitutes', 'name')
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
    body('imageUrl').notEmpty().withMessage('Product image is required'),
    body('title').notEmpty().withMessage('Product title is required'),
    body('price').isNumeric().withMessage('Product price must be a valid number'),
    body('targetAudience').isArray().withMessage('Target audience must be an array'),
    body('targetAudience.*').optional().isIn(['private-users', 'schools', 'businesses']).withMessage('Each target audience must be one of: private-users, schools, businesses'),
    body('visibility').optional().isIn(['public', 'private']).withMessage('Visibility must be either public or private')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg).join(', ');
        return res.status(400).json({ error: errorMessages, errors: errors.array() });
      }

      // Only accept fields from the form
      const productData = {
        imageUrl: req.body.imageUrl,
        title: req.body.title,
        price: parseFloat(req.body.price),
        targetAudience: Array.isArray(req.body.targetAudience) ? req.body.targetAudience : [req.body.targetAudience].filter(Boolean),
        visibility: req.body.visibility || 'public',
        // Set defaults for backward compatibility
        name: req.body.name || 'Product',
        description: req.body.description || '',
        isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      };

      // Generate slug from name
      let baseSlug = generateSlug(productData.name);
      let slug = baseSlug;
      let counter = 1;
      
      // Ensure slug is unique
      while (await Product.findOne({ slug })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      productData.slug = slug;

      // Only set allowedOrganizations and allowedInstitutes if visibility is private
      if (productData.visibility === 'private') {
        if (Array.isArray(req.body.allowedOrganizations)) {
          productData.allowedOrganizations = req.body.allowedOrganizations;
        }
        if (Array.isArray(req.body.allowedInstitutes)) {
          productData.allowedInstitutes = req.body.allowedInstitutes;
        }
      } else {
        productData.allowedOrganizations = [];
        productData.allowedInstitutes = [];
      }

      // Handle level-based card arrays
      if (Array.isArray(req.body.level1)) {
        productData.level1 = req.body.level1;
      } else {
        productData.level1 = [];
      }
      if (Array.isArray(req.body.level2)) {
        productData.level2 = req.body.level2;
      } else {
        productData.level2 = [];
      }
      if (Array.isArray(req.body.level3)) {
        productData.level3 = req.body.level3;
      } else {
        productData.level3 = [];
      }

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
    body('imageUrl').optional().notEmpty().withMessage('Product image URL cannot be empty'),
    body('title').optional().notEmpty().withMessage('Product title cannot be empty'),
    body('price').optional().isNumeric().withMessage('Product price must be a valid number'),
    body('targetAudience').optional().isArray().withMessage('Target audience must be an array'),
    body('targetAudience.*').optional().isIn(['private-users', 'schools', 'businesses']).withMessage('Each target audience must be one of: private-users, schools, businesses'),
    body('visibility').optional().isIn(['public', 'private']).withMessage('Visibility must be either public or private')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg).join(', ');
        return res.status(400).json({ error: errorMessages, errors: errors.array() });
      }

      // Get existing product
      const existingProduct = await Product.findById(req.params.id);
      if (!existingProduct) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Only update fields that are in the form
      const updateData = {};
      
      // Only accept fields from the form
      if (req.body.imageUrl !== undefined) updateData.imageUrl = req.body.imageUrl;
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.price !== undefined) updateData.price = parseFloat(req.body.price);
      if (req.body.targetAudience !== undefined) {
        updateData.targetAudience = Array.isArray(req.body.targetAudience) ? req.body.targetAudience : [req.body.targetAudience].filter(Boolean);
      }
      if (req.body.visibility !== undefined) {
        updateData.visibility = req.body.visibility;
      }
      
      // Handle backward compatibility fields (keep existing values if not provided)
      if (req.body.name !== undefined) updateData.name = req.body.name;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;
      
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
      
      // Handle allowedOrganizations and allowedInstitutes based on visibility
      if (updateData.visibility === 'public' || (updateData.visibility === undefined && existingProduct.visibility === 'public')) {
        updateData.allowedOrganizations = [];
        updateData.allowedInstitutes = [];
      } else if (updateData.visibility === 'private' || existingProduct.visibility === 'private') {
        if (req.body.allowedOrganizations !== undefined) {
          updateData.allowedOrganizations = Array.isArray(req.body.allowedOrganizations) ? req.body.allowedOrganizations : [];
        }
        if (req.body.allowedInstitutes !== undefined) {
          updateData.allowedInstitutes = Array.isArray(req.body.allowedInstitutes) ? req.body.allowedInstitutes : [];
        }
      }

      // Handle level-based card arrays - preserve order exactly as received
      if (req.body.level1 !== undefined) {
        updateData.level1 = Array.isArray(req.body.level1) ? req.body.level1 : [];
        console.log('📝 Level 1 Cards Order (received from frontend):', {
          count: updateData.level1.length,
          order: updateData.level1
        });
      }
      if (req.body.level2 !== undefined) {
        updateData.level2 = Array.isArray(req.body.level2) ? req.body.level2 : [];
        console.log('📝 Level 2 Cards Order (received from frontend):', {
          count: updateData.level2.length,
          order: updateData.level2
        });
      }
      if (req.body.level3 !== undefined) {
        updateData.level3 = Array.isArray(req.body.level3) ? req.body.level3 : [];
        console.log('📝 Level 3 Cards Order (received from frontend):', {
          count: updateData.level3.length,
          order: updateData.level3
        });
      }

      const product = await Product.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      // Log saved card order to verify sequence is maintained
      console.log('✅ Product Updated - Card Sequences Saved:', {
        productId: product._id,
        level1Count: product.level1?.length || 0,
        level2Count: product.level2?.length || 0,
        level3Count: product.level3?.length || 0,
        level1Order: product.level1,
        level2Order: product.level2,
        level3Order: product.level3
      });
      
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



