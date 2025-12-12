const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const Admin = require('../models/Admin');

const router = express.Router();

// Get current admin info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.userId).select('-passwordHash');
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    res.json(admin);
  } catch (error) {
    console.error('Error fetching admin info:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// List all admins
router.get('/', authenticateToken, async (req, res) => {
  try {
    const admins = await Admin.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json(admins);
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;


