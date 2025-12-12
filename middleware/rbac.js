const Admin = require('../models/Admin');

const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const admin = await Admin.findById(req.userId);
      if (!admin || !admin.isActive) {
        return res.status(403).json({ error: 'Admin not found or inactive' });
      }

      // All admins have full access (no role-based restrictions)
      return next();
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
      if (!admin || !admin.isActive) {
        return res.status(403).json({ error: 'Admin not found or inactive' });
      }

      // All admins have full access (no role-based restrictions)
      return next();
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({ error: 'Role check failed' });
    }
  };
};

module.exports = { checkPermission, requireRole };

