const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    req.userId = decoded.adminId || decoded.userId;
    req.adminId = decoded.adminId || decoded.userId; // Set adminId for admin routes
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Optional authentication - doesn't fail if no token, but sets user info if token exists
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    const userId = decoded.adminId || decoded.userId;
    
    if (userId) {
      // Fetch user to get organizationId and schoolId
      const user = await User.findById(userId).select('organizationId schoolId');
      if (user) {
        req.user = {
          userId: user._id.toString(),
          organizationId: user.organizationId?.toString(),
          schoolId: user.schoolId?.toString()
        };
      } else {
        req.user = { userId: userId.toString() };
      }
    } else {
      req.user = null;
    }
    next();
  } catch (error) {
    // Invalid token - continue without user
    req.user = null;
    next();
  }
};

module.exports = { authenticateToken, optionalAuth };

