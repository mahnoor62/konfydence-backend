const Admin = require('../models/Admin');
const User = require('../models/User');

const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const admin = await Admin.findById(req.userId);
      if (admin && admin.isActive) {
        return next(); // admin allowed
      }

      // Fallback: allow authenticated app users (B2B/B2E owners) to proceed
      const user = await User.findById(req.userId).select('isActive');
      if (user && user.isActive !== false) {
        return next();
      }

      return res.status(403).json({ error: 'Admin not found or inactive' });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

const requireRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const admin = await Admin.findById(req.userId);
      if (admin && admin.isActive) {
        return next(); // admin allowed
      }

      // Fallback: allow authenticated app users (B2B/B2E owners) to proceed
      const user = await User.findById(req.userId).select('isActive');
      if (user && user.isActive !== false) {
        return next();
      }

      return res.status(403).json({ error: 'Admin not found or inactive' });
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({ error: 'Role check failed' });
    }
  };
};

module.exports = { checkPermission, requireRole };

