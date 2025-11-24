const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const Admin = require('../models/Admin');

const router = express.Router();

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!admin.isActive) {
        return res.status(403).json({ error: 'Account is deactivated' });
      }

      const isValid = await bcrypt.compare(password, admin.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      admin.lastLogin = new Date();
      await admin.save();

      const token = jwt.sign(
        { adminId: admin._id, email: admin.email, role: 'admin' },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: {
          id: admin._id,
          email: admin.email,
          name: admin.name,
          role: 'admin'
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      const existing = await Admin.findOne({ email });
      if (existing) {
        return res.status(400).json({ error: 'Admin already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const admin = await Admin.create({ email, passwordHash });

      const token = jwt.sign(
        { adminId: admin._id, email: admin.email, role: 'admin' },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '7d' }
      );

      res.status(201).json({
        token,
        user: {
          id: admin._id,
          email: admin.email,
          name: admin.name,
          role: 'admin'
        }
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.post(
  '/register-admin',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, name } = req.body;

      const existing = await Admin.findOne({ email });
      if (existing) {
        return res.status(400).json({ error: 'Admin with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const admin = await Admin.create({
        email,
        passwordHash,
        name: name || email.split('@')[0],
        isActive: true
      });

      const token = jwt.sign(
        { adminId: admin._id, email: admin.email, role: 'admin' },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '7d' }
      );

      res.status(201).json({
        message: 'Admin registered successfully',
        token,
        user: {
          id: admin._id,
          email: admin.email,
          name: admin.name,
          role: 'admin'
        }
      });
    } catch (error) {
      console.error('Admin registration error:', error);
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get('/admins', authenticateToken, async (req, res) => {
  try {
    const admins = await Admin.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json(admins);
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/admins/:id', authenticateToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id).select('-passwordHash');
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    res.json(admin);
  } catch (error) {
    console.error('Error fetching admin:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/admins/:id', authenticateToken, async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (isActive !== undefined) updateData.isActive = isActive;

    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-passwordHash');

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    res.json(admin);
  } catch (error) {
    console.error('Error updating admin:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/admins/:id', authenticateToken, async (req, res) => {
  try {
    if (req.userId === req.params.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const admin = await Admin.findByIdAndDelete(req.params.id);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;





