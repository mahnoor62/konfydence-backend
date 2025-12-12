const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult, custom } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { createTransporter } = require('../utils/emailService');

// Password strength validator
const validateStrongPassword = (value) => {
  if (!value) {
    throw new Error('Password is required');
  }
  
  // At least 8 characters
  if (value.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  
  // At least one uppercase letter
  if (!/[A-Z]/.test(value)) {
    throw new Error('Password must contain at least one uppercase letter');
  }
  
  // At least one lowercase letter
  if (!/[a-z]/.test(value)) {
    throw new Error('Password must contain at least one lowercase letter');
  }
  
  // At least one number
  if (!/[0-9]/.test(value)) {
    throw new Error('Password must contain at least one number');
  }
  
  // At least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)) {
    throw new Error('Password must contain at least one special character (!@#$%^&*...)');
  }
  
  return true;
};

const router = express.Router();



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
        { adminId: admin._id, email: admin.email },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '7d' }
      );

      res.status(201).json({
        message: 'Admin registered successfully',
        token,
        user: {
          id: admin._id,
          email: admin.email,
          name: admin.name
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

// Get current admin profile
router.get('/admin/me', authenticateToken, async (req, res) => {
  try {
    const admin = await Admin.findById(req.adminId).select('-passwordHash');
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    res.json(admin);
  } catch (error) {
    console.error('Error fetching admin profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update current admin profile (name and email)
router.put('/admin/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Check if email is already taken by another admin
    const existingAdmin = await Admin.findOne({ 
      email: email.toLowerCase(),
      _id: { $ne: req.adminId }
    });
    
    if (existingAdmin) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const admin = await Admin.findByIdAndUpdate(
      req.adminId,
      { name, email: email.toLowerCase() },
      { new: true, runValidators: true }
    ).select('-passwordHash');

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json(admin);
  } catch (error) {
    console.error('Error updating admin profile:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Update current admin password
router.put('/admin/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const admin = await Admin.findById(req.adminId);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    // Update password
    admin.passwordHash = newPasswordHash;
    await admin.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating admin password:', error);
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

// Public user registration
router.post(
  '/user/register',
  [
    body('email')
      .isEmail()
      .withMessage('Please enter a valid email address')
      .normalizeEmail()
      .custom(async (value) => {
        // Additional email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          throw new Error('Please enter a valid email address');
        }
        return true;
      }),
    body('password')
      .custom((value) => {
        return validateStrongPassword(value);
      }),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2 })
      .withMessage('Name must be at least 2 characters long')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        const errorMessage = firstError.msg || 'Invalid input. Please check your details.';
        
        return res.status(400).json({ 
          error: errorMessage,
          errors: errors.array()
        });
      }

      const { email, password, name, userType, organizationName, organizationType } = req.body;

      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({ 
          error: 'This email is already registered. Please login instead or use a different email.',
          errorCode: 'EMAIL_ALREADY_EXISTS'
        });
      }

      // Determine user role based on userType
      let userRole = 'b2c_user';
      if (userType === 'b2b') {
        userRole = 'b2b_user';
      } else if (userType === 'b2e') {
        userRole = 'b2e_user';
      }

      // Validate organization fields for B2B/B2E
      if ((userType === 'b2b' || userType === 'b2e') && (!organizationName || !organizationType)) {
        return res.status(400).json({ 
          error: 'Organization name and type are required for B2B/B2E registration'
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      
      // Generate email verification token
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      const emailVerificationExpiry = new Date();
      emailVerificationExpiry.setHours(emailVerificationExpiry.getHours() + 24); // 24 hours expiry

      // Create user
      const user = await User.create({
        email,
        passwordHash,
        name: name || email.split('@')[0],
        role: userRole,
        isActive: true,
        isEmailVerified: false,
        emailVerificationToken,
        emailVerificationExpiry
      });

      // Create organization for B2B/B2E users
      let organization = null;
      if (userType === 'b2b' || userType === 'b2e') {
        const segment = userType === 'b2b' ? 'B2B' : 'B2E';
        organization = await Organization.create({
          name: organizationName,
          type: organizationType,
          segment: segment,
          primaryContact: {
            name: name || email.split('@')[0],
            email: email
          },
          status: 'prospect' // New organization starts as prospect
        });
        
        // Link organization to user
        user.organizationId = organization._id;
        await user.save();
      }

      // Send verification email
      let emailSent = false;
      let emailError = null;
      
      try {
        // Check if email service is configured
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
          console.warn('⚠️ Email service not configured. SMTP_USER or SMTP_PASS missing in environment variables.');
          emailError = 'Email service not configured';
        } else {
          const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${emailVerificationToken}`;
          const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #F5F8FB;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #F5F8FB; padding: 20px;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #063C5E 0%, #0B7897 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #FFFFFF; font-size: 28px; font-weight: 700;">Konfydence</h1>
              <p style="margin: 5px 0 0 0; color: #FFD700; font-size: 14px; font-weight: 500;">Safer Digital Decisions</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #063C5E; font-size: 24px; font-weight: 700;">Verify Your Email Address</h2>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Dear ${name || 'User'},
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Thank you for registering with Konfydence! Please verify your email address by clicking the button below:
              </p>
              <table role="presentation" style="width: 100%; margin: 30px 0; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${verificationUrl}" style="display: inline-block; background-color: #0B7897; color: #FFFFFF; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">Verify Email Address</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 20px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:<br>
                <a href="${verificationUrl}" style="color: #0B7897; word-break: break-all;">${verificationUrl}</a>
              </p>
              <p style="margin: 30px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                This link will expire in 24 hours. If you didn't create an account, please ignore this email.
              </p>
              <div style="border-top: 2px solid #F5F8FB; padding-top: 20px; margin-top: 30px;">
                <p style="margin: 0; color: #0B7897; font-size: 14px; font-weight: 600;">
                  Best regards,<br>
                  The Konfydence Team
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #063C5E; padding: 20px 30px; text-align: center;">
              <p style="margin: 0; color: #FFFFFF; font-size: 12px;">
                © ${new Date().getFullYear()} Konfydence. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;

          const transporter = createTransporter();
          const info = await transporter.sendMail({
            from: `"Konfydence" <${process.env.SMTP_USER}>`,
            to: email,
            subject: 'Verify Your Email Address - Konfydence',
            html: emailHtml,
            text: `Dear ${name || 'User'},\n\nThank you for registering with Konfydence! Please verify your email address by clicking this link: ${verificationUrl}\n\nThis link will expire in 24 hours.\n\nBest regards,\nThe Konfydence Team`
          });
          
          emailSent = true;
          console.log('✅ Verification email sent successfully:', {
            messageId: info.messageId,
            to: email,
            accepted: info.accepted,
            rejected: info.rejected
          });
        }
      } catch (err) {
        emailError = err.message || 'Unknown error';
        console.error('❌ Error sending verification email:', {
          error: err.message,
          stack: err.stack,
          to: email,
          smtpConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASS)
        });
      }

      // Return response with email status
      const response = {
        message: emailSent 
          ? 'Registration successful! Please check your email to verify your account.'
          : 'Registration successful! However, we could not send the verification email. Please use the resend verification option.',
        requiresVerification: true,
        emailSent: emailSent,
        emailError: emailError,
        verificationToken: emailSent ? undefined : emailVerificationToken, // Only send token if email failed (for testing)
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          isEmailVerified: false
        },
        organization: organization ? {
          id: organization._id,
          name: organization.name,
          type: organization.type,
          segment: organization.segment
        } : null
      };

      // Log email status
      if (!emailSent) {
        console.warn('⚠️ User registered but email not sent:', {
          userId: user._id,
          email: user.email,
          error: emailError,
          verificationToken: emailVerificationToken
        });
      }

      res.status(201).json(response);
    } catch (error) {
      console.error('Register error:', error);
      if (error.code === 11000) {
        return res.status(400).json({ 
          error: 'This email is already registered. Please login instead or use a different email.',
          errorCode: 'EMAIL_ALREADY_EXISTS'
        });
      }
      res.status(500).json({ error: 'Server error. Please try again later.' });
    }
  }
);

// Public user login
router.post(
  '/user/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        const errorMessage = firstError.msg || 'Invalid input. Please check your details.';
        
        return res.status(400).json({ 
          error: errorMessage,
          errors: errors.array()
        });
      }

      const { email, password } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ 
          error: 'User not found. Please register yourself.',
          errorCode: 'USER_NOT_FOUND'
        });
      }

      if (!user.isActive) {
        return res.status(403).json({ 
          error: 'Account is deactivated. Please contact support to reactivate your account.',
          errorCode: 'ACCOUNT_DEACTIVATED'
        });
      }

      if (!user.isEmailVerified) {
        return res.status(403).json({ 
          error: 'Please verify your email address before logging in. Check your inbox for the verification link.',
          errorCode: 'EMAIL_NOT_VERIFIED'
        });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ 
          error: 'Invalid password. Please check your password and try again.',
          errorCode: 'INVALID_PASSWORD'
        });
      }

      user.lastLogin = new Date();
      await user.save();

      const token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '30d' }
      );

      res.json({
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Admin login handler function
const adminLoginHandler = async (req, res) => {
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
      { adminId: admin._id, email: admin.email },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: admin._id,
        email: admin.email,
        name: admin.name
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Admin login endpoints (backward compatibility)
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  adminLoginHandler
);

router.post(
  '/admin/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  adminLoginHandler
);

// Get current user (for frontend)
router.get('/user/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-passwordHash -emailVerificationToken -passwordResetToken')
      .populate('memberships.packageId', 'name pricing');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Include profile photo URL if exists
    const userData = user.toObject();
    if (userData.profilePhoto) {
      const apiBase = process.env.API_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5000';
      const normalizedApiBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
      userData.profilePhotoUrl = `${normalizedApiBase}${userData.profilePhoto}`;
    }

    res.json(userData);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify email
router.get('/user/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpiry: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpiry = undefined;
    await user.save();

    res.json({ 
      message: 'Email verified successfully! You can now login.',
      verified: true
    });
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resend verification email
router.post('/user/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Generate new verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpiry = new Date();
    emailVerificationExpiry.setHours(emailVerificationExpiry.getHours() + 24);

    user.emailVerificationToken = emailVerificationToken;
    user.emailVerificationExpiry = emailVerificationExpiry;
    await user.save();

    // Send verification email
    let emailSent = false;
    let emailError = null;
    
    try {
      // Check if email service is configured
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('⚠️ Email service not configured. SMTP_USER or SMTP_PASS missing.');
        emailError = 'Email service not configured';
      } else {
        const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${emailVerificationToken}`;
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Verify Your Email</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #F5F8FB; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 8px; padding: 30px;">
    <h2 style="color: #063C5E;">Verify Your Email Address</h2>
    <p>Please click the button below to verify your email:</p>
    <a href="${verificationUrl}" style="display: inline-block; background-color: #0B7897; color: #FFFFFF; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0;">Verify Email</a>
    <p style="color: #666666; font-size: 14px;">Or copy this link: ${verificationUrl}</p>
    <p style="color: #666666; font-size: 14px;">This link expires in 24 hours.</p>
  </div>
</body>
</html>
        `;

        const transporter = createTransporter();
        const info = await transporter.sendMail({
          from: `"Konfydence" <${process.env.SMTP_USER}>`,
          to: email,
          subject: 'Verify Your Email Address - Konfydence',
          html: emailHtml
        });
        
        emailSent = true;
        console.log('✅ Resend verification email sent successfully:', {
          messageId: info.messageId,
          to: email,
          accepted: info.accepted,
          rejected: info.rejected
        });
      }
    } catch (err) {
      emailError = err.message || 'Unknown error';
      console.error('❌ Error resending verification email:', {
        error: err.message,
        stack: err.stack,
        to: email,
        smtpConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASS)
      });
    }

    if (emailSent) {
      res.json({ 
        message: 'Verification email sent successfully. Please check your inbox.',
        emailSent: true
      });
    } else {
      res.status(500).json({ 
        error: emailError || 'Failed to send verification email. Please check your email service configuration.',
        emailSent: false,
        verificationToken: emailVerificationToken // Provide token for manual verification if needed
      });
    }
  } catch (error) {
    console.error('Error resending verification:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Request password reset
router.post('/user/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email });
    // Don't reveal if user exists or not for security
    if (!user) {
      return res.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
    }

    // Generate reset token
    const passwordResetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetExpiry = new Date();
    passwordResetExpiry.setHours(passwordResetExpiry.getHours() + 1); // 1 hour expiry

    user.passwordResetToken = passwordResetToken;
    user.passwordResetExpiry = passwordResetExpiry;
    await user.save();

    // Send reset email
    try {
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${passwordResetToken}`;
      const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Your Password</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #F5F8FB; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 8px; padding: 30px;">
    <h2 style="color: #063C5E;">Reset Your Password</h2>
    <p>You requested to reset your password. Click the button below to reset it:</p>
    <a href="${resetUrl}" style="display: inline-block; background-color: #0B7897; color: #FFFFFF; padding: 14px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0;">Reset Password</a>
    <p style="color: #666666; font-size: 14px;">Or copy this link: ${resetUrl}</p>
    <p style="color: #666666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
  </div>
</body>
</html>
      `;

      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        const transporter = createTransporter();
        await transporter.sendMail({
          from: `"Konfydence" <${process.env.SMTP_USER}>`,
          to: email,
          subject: 'Reset Your Password - Konfydence',
          html: emailHtml
        });
      }
    } catch (emailError) {
      console.error('Error sending reset email:', emailError);
    }

    res.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password
router.post('/user/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').custom((value) => {
    return validateStrongPassword(value);
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return res.status(400).json({ error: firstError.msg || 'Invalid password' });
    }

    const { token, password } = req.body;

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpiry: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    user.passwordHash = passwordHash;
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully! You can now login with your new password.' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;





