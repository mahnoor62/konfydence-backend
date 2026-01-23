const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult, custom } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Organization = require('../models/Organization');
const School = require('../models/School');
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

// Function to generate unique 6-digit referral code
const generateReferralCode = async () => {
  let code;
  let isUnique = false;
  while (!isUnique) {
    // Generate 6-digit numeric code
    code = Math.floor(100000 + Math.random() * 900000).toString();
    // Check if code already exists
    const existing = await User.findOne({ referralCode: code });
    if (!existing) {
      isUnique = true;
    }
  }
  return code;
};

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

      const { email, password, name, userType, organizationName, organizationType, customOrganizationType, referralCode } = req.body;

      // Log registration attempt for debugging
      console.log('Registration attempt:', {
        email,
        userType,
        hasOrganizationName: !!organizationName,
        hasOrganizationType: !!organizationType
      });

      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({ 
          error: 'This email is already registered. Please login instead or use a different email.',
          errorCode: 'EMAIL_ALREADY_EXISTS'
        });
      }

      // Determine user role based on userType - CRITICAL: Ensure role matches userType
      let userRole = 'b2c_user';
      if (userType === 'b2b') {
        userRole = 'b2b_user';
      } else if (userType === 'b2e') {
        userRole = 'b2e_user';
      }

      // Validate: If organization/school data is provided, userType must be b2b or b2e
      if ((organizationName || organizationType) && userType !== 'b2b' && userType !== 'b2e') {
        console.warn('Warning: Organization data provided but userType is not b2b/b2e:', { userType, organizationName });
        return res.status(400).json({ 
          error: 'Invalid registration type. Organization data requires B2B or B2E registration.',
          errorCode: 'INVALID_USER_TYPE'
        });
      }

      // Validate organization fields for B2B/B2E
      if ((userType === 'b2b' || userType === 'b2e') && (!organizationName || !organizationType)) {
        return res.status(400).json({ 
          error: 'Organization name and type are required for B2B/B2E registration'
        });
      }

      // Validate custom organization type when "other" is selected
      if ((userType === 'b2b' || userType === 'b2e') && organizationType === 'other' && !customOrganizationType) {
        return res.status(400).json({ 
          error: 'Please specify your organization type'
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      
      // Generate email verification token
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      const emailVerificationExpiry = new Date();
      emailVerificationExpiry.setHours(emailVerificationExpiry.getHours() + 24); // 24 hours expiry

      // Generate unique referral code for new user
      const newUserReferralCode = await generateReferralCode();
      
      // Validate and find referrer if referralCode is provided
      let referrerId = null;
      let referedByCode = null;
      if (referralCode) {
        try {
          // Find user by referralCode (not by ID anymore)
          const referrer = await User.findOne({ referralCode: referralCode });
          if (referrer) {
            // Make sure user is not referring themselves
            if (referrer.email.toLowerCase() !== email.toLowerCase()) {
              referrerId = referrer._id;
              referedByCode = referralCode;
              console.log('Referrer found with code:', referralCode, 'for new user:', email);
            } else {
              console.log('User cannot refer themselves');
            }
          } else {
            console.log('Referrer not found for referral code:', referralCode);
          }
        } catch (error) {
          console.error('Error validating referral code:', error);
          // Continue without referral if invalid code
        }
      }

      // Create user FIRST - this ensures we have user._id for ownerId
      const user = await User.create({
        email,
        passwordHash,
        name: name || email.split('@')[0],
        role: userRole, // CRITICAL: Ensure role is set correctly based on userType
        isActive: true,
        isEmailVerified: false,
        emailVerificationToken,
        emailVerificationExpiry,
        referredBy: referrerId,
        referralCode: newUserReferralCode,
        referedBy: referedByCode
      });

      // Verify user was created successfully and has _id
      if (!user || !user._id) {
        return res.status(500).json({ 
          error: 'Failed to create user account. Please try again.',
          errorCode: 'USER_CREATION_FAILED'
        });
      }

      // Log user creation for debugging
      console.log('User created:', {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        expectedRole: userRole,
        userType: userType,
        roleMatches: user.role === userRole
      });

      // Create organization or school for B2B/B2E users with CORRECT ownerId
      let organization = null;
      let school = null;
      try {
        if (userType === 'b2b') {
          // Generate unique code before creating
          let uniqueCode;
          let isUnique = false;
          while (!isUnique) {
            uniqueCode = 'ORG-' + crypto.randomBytes(4).toString('hex').toUpperCase();
            const existing = await Organization.findOne({ uniqueCode });
            if (!existing) {
              isUnique = true;
            }
          }

          // Check if organization with same name already exists (case-insensitive)
          // Escape special regex characters in the name
          const escapedName = organizationName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const duplicateOrg = await Organization.findOne({ 
            name: { $regex: new RegExp(`^${escapedName}$`, 'i') } 
          });
          if (duplicateOrg) {
            // Cleanup user if organization name is duplicate
            await User.findByIdAndDelete(user._id);
            return res.status(400).json({ 
              error: `An organization with the name "${organizationName.trim()}" already exists. Please use a different name.`
            });
          }

          const organizationData = {
            name: organizationName.trim(),
            type: organizationType,
            segment: 'B2B', // B2B users create B2B organizations
            uniqueCode: uniqueCode,
            primaryContact: {
              name: name || email.split('@')[0],
              email: email
            },
            status: 'prospect',
            ownerId: user._id // CRITICAL: Use the actual user._id that was just created
          };
          
          // Add custom type if "other" is selected
          if (organizationType === 'other' && customOrganizationType) {
            organizationData.customType = customOrganizationType.trim();
          }
          
          organization = await Organization.create(organizationData);
          
          // Log organization creation for debugging
          console.log('Organization created:', {
            organizationId: organization._id.toString(),
            ownerId: organization.ownerId.toString(),
            userId: user._id.toString(),
            ownerIdMatches: organization.ownerId.toString() === user._id.toString()
          });
          
          // Verify organization was created with correct ownerId
          if (organization.ownerId.toString() !== user._id.toString()) {
            // Cleanup and return error
            await User.findByIdAndDelete(user._id);
            await Organization.findByIdAndDelete(organization._id);
            console.error('ERROR: Organization ownerId does not match user._id:', {
              organizationOwnerId: organization.ownerId.toString(),
              userId: user._id.toString()
            });
            return res.status(500).json({ 
              error: 'Failed to link organization to user. Please try again.',
              errorCode: 'ORGANIZATION_LINK_FAILED'
            });
          }
          
          // Link organization to user - Use findByIdAndUpdate to ensure it's saved properly
          await User.findByIdAndUpdate(user._id, {
            organizationId: organization._id
          }, { new: true });
          
          // Refresh user object to include organizationId
          const updatedUser = await User.findById(user._id);
          if (updatedUser) {
            Object.assign(user, updatedUser);
          }
          
          console.log('✅ Organization linked to user:', {
            userId: user._id.toString(),
            organizationId: organization._id.toString(),
            userOrganizationId: user.organizationId?.toString()
          });
        } else if (userType === 'b2e') {
          // Generate unique code before creating
          let uniqueCode;
          let isUnique = false;
          while (!isUnique) {
            uniqueCode = 'SCH-' + crypto.randomBytes(4).toString('hex').toUpperCase();
            const existing = await School.findOne({ uniqueCode });
            if (!existing) {
              isUnique = true;
            }
          }

          // Check if school with same name already exists (case-insensitive)
          // Escape special regex characters in the name
          const escapedName = organizationName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const duplicateSchool = await School.findOne({ 
            name: { $regex: new RegExp(`^${escapedName}$`, 'i') } 
          });
          if (duplicateSchool) {
            // Cleanup user if school name is duplicate
            await User.findByIdAndDelete(user._id);
            return res.status(400).json({ 
              error: `A school/institute with the name "${organizationName.trim()}" already exists. Please use a different name.`
            });
          }

          const schoolData = {
            name: organizationName.trim(),
            type: organizationType,
            uniqueCode: uniqueCode,
            primaryContact: {
              name: name || email.split('@')[0],
              email: email
            },
            status: 'prospect',
            ownerId: user._id // CRITICAL: Use the actual user._id that was just created
          };
          
          // Add custom type if "other" is selected
          if (organizationType === 'other' && customOrganizationType) {
            schoolData.customType = customOrganizationType.trim();
          }
          
          school = await School.create(schoolData);
          
          // Log school creation for debugging
          console.log('School created:', {
            schoolId: school._id.toString(),
            ownerId: school.ownerId.toString(),
            userId: user._id.toString(),
            ownerIdMatches: school.ownerId.toString() === user._id.toString()
          });
          
          // Verify school was created with correct ownerId
          if (school.ownerId.toString() !== user._id.toString()) {
            // Cleanup and return error
            await User.findByIdAndDelete(user._id);
            await School.findByIdAndDelete(school._id);
            console.error('ERROR: School ownerId does not match user._id:', {
              schoolOwnerId: school.ownerId.toString(),
              userId: user._id.toString()
            });
            return res.status(500).json({ 
              error: 'Failed to link school to user. Please try again.',
              errorCode: 'SCHOOL_LINK_FAILED'
            });
          }
          
          // Link school to user - Use findByIdAndUpdate to ensure it's saved properly
          await User.findByIdAndUpdate(user._id, {
            schoolId: school._id
          }, { new: true });
          
          // Refresh user object to include schoolId
          const updatedUser = await User.findById(user._id);
          if (updatedUser) {
            Object.assign(user, updatedUser);
          }
          
          console.log('✅ School linked to user:', {
            userId: user._id.toString(),
            schoolId: school._id.toString(),
            userSchoolId: user.schoolId?.toString()
          });
        }
      } catch (orgError) {
        // If organization/school creation fails, delete the user
        await User.findByIdAndDelete(user._id);
        
        if (orgError.code === 11000) {
          return res.status(400).json({ 
            error: 'An organization or school with this name already exists. Please use a different name.',
            errorCode: 'DUPLICATE_ORGANIZATION'
          });
        }
        
        console.error('Error creating organization/school:', orgError);
        return res.status(500).json({ 
          error: 'Failed to create organization/school. Please try again later.',
          errorCode: 'ORGANIZATION_CREATION_FAILED'
        });
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
          
          // Include unique code in email if organization or school is created
          let uniqueCodeSection = '';
          if (organization) {
            uniqueCodeSection = `
              <div style="background-color: #F5F8FB; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #0B7897;">
                <h3 style="margin: 0 0 10px 0; color: #063C5E; font-size: 18px; font-weight: 600;">Your Organization Registration Code</h3>
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                  Your organization has been successfully registered! This is your organization registration code:
                </p>
                <div style="background-color: #FFFFFF; padding: 15px; border-radius: 4px; text-align: center; margin: 15px 0;">
                  <p style="margin: 0; color: #0B7897; font-size: 24px; font-weight: 700; letter-spacing: 2px;">${organization.uniqueCode}</p>
                </div>
                <p style="margin: 10px 0 0 0; color: #333333; font-size: 15px; line-height: 1.6; font-weight: 600;">
                  Share this code with your organization members:
                </p>
                <p style="margin: 10px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                  Your organization members can use this code to register and become members of your organization. They will need your approval before they can access the platform. This code is specifically for your organization registration and member management.
                </p>
              </div>
            `;
          } else if (school) {
            uniqueCodeSection = `
              <div style="background-color: #F5F8FB; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #0B7897;">
                <h3 style="margin: 0 0 10px 0; color: #063C5E; font-size: 18px; font-weight: 600;">Your School Registration Code</h3>
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                  Your school has been successfully registered! This is your school registration code:
                </p>
                <div style="background-color: #FFFFFF; padding: 15px; border-radius: 4px; text-align: center; margin: 15px 0;">
                  <p style="margin: 0; color: #0B7897; font-size: 24px; font-weight: 700; letter-spacing: 2px;">${school.uniqueCode}</p>
                </div>
                <p style="margin: 10px 0 0 0; color: #333333; font-size: 15px; line-height: 1.6; font-weight: 600;">
                  Share this code with your school members:
                </p>
                <p style="margin: 10px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                  Your school members can use this code to register and become members of your school. They will need your approval before they can access the platform. This code is specifically for your school registration and member management.
                </p>
              </div>
            `;
          }
          
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
              <div style="background-color: #FFF3CD; border-left: 4px solid #FFC107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #856404; font-size: 15px; font-weight: 600; line-height: 1.6;">
                  ⚠️ Important: You must verify your email address before you can login to your account.
                </p>
              </div>
              <table role="presentation" style="width: 100%; margin: 30px 0; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${verificationUrl}" style="display: inline-block; background-color: #0B7897; color: #FFFFFF; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">Verify Email Address</a>
                  </td>
                </tr>
              </table>
              ${uniqueCodeSection}
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
            from: `"Konfydence" <${process.env.MAIL_FROM}>`,
            to: email,
            subject: 'Verify Your Email Address - Konfydence',
            html: emailHtml,
            text: `Dear ${name || 'User'},\n\nThank you for registering with Konfydence!\n\nIMPORTANT: You must verify your email address before you can login to your account.\n\nPlease verify your email address by clicking this link: ${verificationUrl}\n\n${organization ? `\nYour Organization Registration Code: ${organization.uniqueCode}\n\nThis code is for your organization registration. Share this code with your organization members so they can register and become members of your organization. They will need your approval before they can access the platform.\n` : ''}${school ? `\nYour School Registration Code: ${school.uniqueCode}\n\nThis code is for your school registration. Share this code with your school members so they can register and become members of your school. They will need your approval before they can access the platform.\n` : ''}\nThis link will expire in 24 hours. If you didn't create an account, please ignore this email.\n\nBest regards,\nThe Konfydence Team`
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
          uniqueCode: organization.uniqueCode
        } : null,
        school: school ? {
          id: school._id,
          name: school.name,
          type: school.type,
          uniqueCode: school.uniqueCode
        } : null
      };

      // Refresh user from database to ensure we have the latest data including schoolId/organizationId
      const refreshedUser = await User.findById(user._id);
      if (!refreshedUser) {
        return res.status(500).json({ 
          error: 'Failed to retrieve user data. Please try logging in.',
          errorCode: 'USER_RETRIEVAL_FAILED'
        });
      }
      
      // Update response with refreshed user data
      response.user = {
        id: refreshedUser._id,
        email: refreshedUser.email,
        name: refreshedUser.name,
        role: refreshedUser.role,
        organizationId: refreshedUser.organizationId || null,
        schoolId: refreshedUser.schoolId || null,
        isEmailVerified: refreshedUser.isEmailVerified
      };
      
      // Log email status
      if (!emailSent) {
        console.warn('⚠️ User registered but email not sent:', {
          userId: refreshedUser._id,
          email: refreshedUser.email,
          error: emailError,
          verificationToken: emailVerificationToken
        });
      }
      
      // Log final user data for debugging
      console.log('✅ Registration completed:', {
        userId: refreshedUser._id.toString(),
        email: refreshedUser.email,
        role: refreshedUser.role,
        organizationId: refreshedUser.organizationId?.toString() || null,
        schoolId: refreshedUser.schoolId?.toString() || null
      });

      res.status(201).json(response);
    } catch (error) {
      console.error('Register error:', error);
      
      // If user was created but something else failed, try to clean up
      if (error.userId) {
        try {
          await User.findByIdAndDelete(error.userId);
        } catch (cleanupError) {
          console.error('Error during cleanup:', cleanupError);
        }
      }
      
      if (error.code === 11000) {
        if (error.keyPattern && error.keyPattern.email) {
          return res.status(400).json({ 
            error: 'This email is already registered. Please login instead or use a different email.',
            errorCode: 'EMAIL_ALREADY_EXISTS'
          });
        }
        return res.status(400).json({ 
          error: 'A record with this information already exists. Please check your details and try again.',
          errorCode: 'DUPLICATE_ENTRY'
        });
      }
      
      // Provide user-friendly error messages
      if (error.name === 'ValidationError') {
        const firstError = Object.values(error.errors)[0];
        return res.status(400).json({ 
          error: firstError?.message || 'Invalid input. Please check your details and try again.',
          errorCode: 'VALIDATION_ERROR'
        });
      }
      
      res.status(500).json({ 
        error: 'Registration failed. Please try again later. If the problem persists, please contact support.',
        errorCode: 'SERVER_ERROR'
      });
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

      // Check if user is a member with pending approval
      const isMember = user.role === 'b2b_member' || user.role === 'b2e_member';
      if (isMember && user.memberStatus === 'pending') {
        return res.status(403).json({ 
          error: 'Your membership request is pending approval. Once the admin approves your request, you will be able to login.',
          errorCode: 'MEMBER_PENDING_APPROVAL'
        });
      }

      // For non-members or approved members, check email verification
      if (!user.isEmailVerified && !isMember) {
        return res.status(403).json({ 
          error: 'Please verify your email address before logging in. Check your inbox for the verification link.',
          errorCode: 'EMAIL_NOT_VERIFIED'
        });
      }

      // Check if password is not set (user created from lead conversion)
      if (!user.passwordHash || user.passwordHash === 'NO_PASSWORD_SET') {
        return res.status(403).json({ 
          error: 'Password not set. Please reset your password to continue.',
          errorCode: 'PASSWORD_NOT_SET',
          requiresPasswordReset: true,
          passwordResetToken: user.passwordResetToken || null
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
          role: user.role,
          organizationId: user.organizationId || null,
          schoolId: user.schoolId || null,
          memberStatus: user.memberStatus || null
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

    // Express automatically decodes URL-encoded query parameters, but let's ensure we handle it properly
    // Try to find user with the token as-is first (most common case)
    let user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpiry: { $gt: new Date() }
    });

    // If not found, try with decoded token (in case of double encoding)
    if (!user) {
      try {
        const decodedToken = decodeURIComponent(token);
        user = await User.findOne({
          emailVerificationToken: decodedToken,
          emailVerificationExpiry: { $gt: new Date() }
        });
      } catch (decodeError) {
        // If decode fails, token wasn't encoded, continue with original
      }
    }

    if (!user) {
      // Additional check: see if token exists but expired
      const expiredUser = await User.findOne({
        emailVerificationToken: token
      });
      
      if (expiredUser) {
        return res.status(400).json({ error: 'Verification token has expired. Please request a new verification email.' });
      }

      console.error('Verification failed - Token not found:', {
        tokenLength: token ? token.length : 0,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'null'
      });
      
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    // Verify the email
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
          from: `"Konfydence" <${process.env.MAIL_FROM}>`,
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
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
              <h2 style="margin: 0 0 20px 0; color: #063C5E; font-size: 24px; font-weight: 700;">Reset Your Password</h2>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                You requested to reset your password. Click the button below to reset it:
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="display: inline-block; background-color: #0B7897; color: #FFFFFF; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Reset Password</a>
              </div>
              <p style="margin: 20px 0 10px 0; color: #666666; font-size: 14px; line-height: 1.6;">
                Or copy this link:
              </p>
              <p style="margin: 0 0 20px 0; color: #0B7897; font-size: 13px; word-break: break-all; line-height: 1.6;">
                ${resetUrl}
              </p>
              <div style="background-color: #FFF3CD; border-left: 4px solid #FFC107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.6;">
                  ⚠️ This link expires in 1 hour. If you didn't request this, please ignore this email.
                </p>
              </div>
              <p style="margin: 30px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                Best regards,<br>
                The Konfydence Team
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

      if (process.env.MAIL_FROM && process.env.SMTP_PASS) {
        const transporter = createTransporter();
        await transporter.sendMail({
          from: `"Konfydence" <${process.env.MAIL_FROM}>`,
          to: email,
          subject: 'Reset Your Password - Konfydence',
          html: emailHtml,
          text: `Reset Your Password - Konfydence\n\nYou requested to reset your password. Click the link below to reset it:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, please ignore this email.\n\nBest regards,\nThe Konfydence Team`
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

// Member Registration (Organization/School Member)
router.post(
  '/member/register',
  [
    body('email')
      .isEmail()
      .withMessage('Please enter a valid email address')
      .normalizeEmail(),
    body('password')
      .custom((value) => {
        return validateStrongPassword(value);
      }),
    body('name')
      .trim()
      .isLength({ min: 2 })
      .withMessage('Name must be at least 2 characters long'),
    body('organizationCode')
      .notEmpty()
      .withMessage('Organization or School code is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        return res.status(400).json({ 
          error: firstError.msg || 'Invalid input. Please check your details.'
        });
      }

      const { email, password, name, organizationCode, referralCode } = req.body;

      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({ 
          error: 'This email is already registered. Please login instead or use a different email.',
          errorCode: 'EMAIL_ALREADY_EXISTS'
        });
      }

      // Find organization or school by code
      const organization = await Organization.findOne({ uniqueCode: organizationCode.toUpperCase() });
      const school = await School.findOne({ uniqueCode: organizationCode.toUpperCase() });

      if (!organization && !school) {
        return res.status(400).json({ 
          error: 'Invalid organization or school code. Please check your code and try again.'
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      
      // Generate unique referral code for new user
      const newUserReferralCode = await generateReferralCode();
      
      // Validate referral code if provided
      let referedByCode = null;
      if (referralCode) {
        try {
          const referrer = await User.findOne({ referralCode: referralCode });
          if (referrer && referrer.email.toLowerCase() !== email.toLowerCase()) {
            referedByCode = referralCode;
            console.log('Member registered with referral code:', referralCode);
          }
        } catch (error) {
          console.error('Error validating referral code for member:', error);
        }
      }
      
      // Create user as member
      const user = await User.create({
        email,
        passwordHash,
        name: name || email.split('@')[0],
        role: organization ? 'b2b_member' : 'b2e_member',
        isActive: true,
        isEmailVerified: false, // No email verification for members initially
        organizationId: organization ? organization._id : null,
        schoolId: school ? school._id : null,
        memberStatus: 'pending', // Pending approval
        referralCode: newUserReferralCode,
        referedBy: referedByCode
      });

      // Create member request
      const MemberRequest = require('../models/MemberRequest');
      await MemberRequest.create({
        user: user._id,
        organizationId: organization ? organization._id : null,
        schoolId: school ? school._id : null,
        organizationCode: organizationCode.toUpperCase(),
        status: 'pending'
      });

      res.status(201).json({
        message: 'Registration successful! Your request has been sent to the organization/school admin for approval. You will receive an email once approved.',
        requiresApproval: true,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          memberStatus: 'pending'
        },
        organization: organization ? {
          name: organization.name
        } : null,
        school: school ? {
          name: school.name
        } : null
      });
    } catch (error) {
      console.error('Member registration error:', error);
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

// Member Login (with code)
router.post(
  '/member/login',
  [
    body('code')
      .notEmpty()
      .withMessage('Organization or School code is required'),
    body('email')
      .isEmail()
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        return res.status(400).json({ 
          error: firstError.msg || 'Invalid input.'
        });
      }

      const { email, password, code } = req.body;

      // Find organization or school by code
      const organization = await Organization.findOne({ uniqueCode: code.toUpperCase() });
      const school = await School.findOne({ uniqueCode: code.toUpperCase() });

      if (!organization && !school) {
        return res.status(400).json({ 
          error: 'Invalid organization or school code. Please check your code and try again.'
        });
      }

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ 
          error: 'User not found. Please register yourself first.',
          errorCode: 'USER_NOT_FOUND'
        });
      }

      // Verify user belongs to this organization/school
      if (organization) {
        if (!user.organizationId || user.organizationId.toString() !== organization._id.toString()) {
          return res.status(403).json({ 
            error: `You are not a member of this organization (${organization.name}). Please register as a member of this organization.`,
            errorCode: 'NOT_MEMBER',
            organizationName: organization.name
          });
        }
      }

      if (school) {
        if (!user.schoolId || user.schoolId.toString() !== school._id.toString()) {
          return res.status(403).json({ 
            error: `You are not a member of this school (${school.name}). Please register as a member of this school.`,
            errorCode: 'NOT_MEMBER',
            schoolName: school.name
          });
        }
      }

      // Check if member is approved
      if (user.memberStatus !== 'approved') {
        return res.status(403).json({ 
          error: 'Your membership request is pending approval. Please wait for admin approval.',
          errorCode: 'PENDING_APPROVAL',
          memberStatus: user.memberStatus
        });
      }

      if (!user.isActive) {
        return res.status(403).json({ 
          error: 'Account is deactivated. Please contact support to reactivate your account.',
          errorCode: 'ACCOUNT_DEACTIVATED'
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
          role: user.role,
          organizationName: organization ? organization.name : (school ? school.name : null)
        }
      });
    } catch (error) {
      console.error('Member login error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get member requests for organization/school admin
router.get('/member/requests', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is organization or school owner
    let organization = null;
    let school = null;

    if (user.organizationId) {
      organization = await Organization.findOne({ _id: user.organizationId, ownerId: user._id });
    }

    if (user.schoolId) {
      school = await School.findOne({ _id: user.schoolId, ownerId: user._id });
    }

    if (!organization && !school) {
      return res.status(403).json({ error: 'You are not authorized to view member requests.' });
    }

    const MemberRequest = require('../models/MemberRequest');
    
    // Build query - only include valid organizationId or schoolId
    const query = { status: 'pending' };
    const orConditions = [];
    
    if (organization && organization._id) {
      orConditions.push({ organizationId: organization._id });
    }
    
    if (school && school._id) {
      orConditions.push({ schoolId: school._id });
    }
    
    // Only add $or if we have at least one valid condition
    if (orConditions.length > 0) {
      query.$or = orConditions;
    } else {
      // If no valid organization or school, return empty array
      return res.json({
        requests: [],
        organization: null,
        school: null
      });
    }
    
    const requests = await MemberRequest.find(query)
      .populate('user', 'name email createdAt')
      .sort({ createdAt: -1 });

    res.json({
      requests,
      organization: organization ? { name: organization.name, uniqueCode: organization.uniqueCode } : null,
      school: school ? { name: school.name, uniqueCode: school.uniqueCode } : null
    });
  } catch (error) {
    console.error('Error fetching member requests:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve/Reject member request
router.post('/member/requests/:requestId/:action', authenticateToken, async (req, res) => {
  try {
    const { requestId, action } = req.params;
    const { rejectionReason } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use approve or reject.' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const MemberRequest = require('../models/MemberRequest');
    const request = await MemberRequest.findById(requestId)
      .populate('user')
      .populate('organizationId')
      .populate('schoolId');

    if (!request) {
      return res.status(404).json({ error: 'Member request not found' });
    }

    // Verify user is the owner
    let organization = null;
    let school = null;

    if (request.organizationId) {
      organization = await Organization.findOne({ 
        _id: request.organizationId._id, 
        ownerId: user._id 
      });
    }

    if (request.schoolId) {
      school = await School.findOne({ 
        _id: request.schoolId._id, 
        ownerId: user._id 
      });
    }

    if (!organization && !school) {
      return res.status(403).json({ error: 'You are not authorized to perform this action.' });
    }

    if (action === 'approve') {
      request.status = 'approved';
      request.approvedBy = user._id;
      request.approvedAt = new Date();
      await request.save();

      // Update user
      const memberUser = await User.findById(request.user._id);
      memberUser.memberStatus = 'approved';
      memberUser.memberApprovedAt = new Date();
      memberUser.memberApprovedBy = user._id;
      memberUser.isEmailVerified = true; // Auto-verify approved members
      await memberUser.save();

      // Add member to organization/school members/students array for easy lookup
      if (organization) {
        await Organization.findByIdAndUpdate(organization._id, {
          $addToSet: { members: memberUser._id }
        });
      }
      if (school) {
        // Schools use 'students' array (similar to organizations using 'members')
        await School.findByIdAndUpdate(school._id, {
          $addToSet: { students: memberUser._id }
        });
      }

      // Send approval email with login code
      try {
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
          const loginCode = organization ? organization.uniqueCode : school.uniqueCode;
          const orgName = organization ? organization.name : school.name;
          const verificationUrl = `${process.env.FRONTEND_URL}/login`;
          
          const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Membership Approved</title>
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
              <h2 style="margin: 0 0 20px 0; color: #063C5E; font-size: 24px; font-weight: 700;">Membership Approved</h2>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Dear ${memberUser.name || 'Member'},
              </p>
              <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Congratulations! Your membership request for <strong>${orgName}</strong> has been approved.
              </p>
              <div style="background-color: #F5F8FB; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #4caf50;">
                <p style="margin: 0 0 10px 0; color: #333333; font-size: 16px; line-height: 1.6;">
                  You can now login to your account using your email and password.
                </p>
                <p style="margin: 10px 0 0 0; color: #666666; font-size: 14px; line-height: 1.6;">
                  Visit <a href="${verificationUrl}" style="color: #0B7897;">${verificationUrl}</a> to access your dashboard.
                </p>
              </div>
              <table role="presentation" style="width: 100%; margin: 30px 0; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <a href="${verificationUrl}" style="display: inline-block; background-color: #0B7897; color: #FFFFFF; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600; font-size: 16px;">Login Now</a>
                  </td>
                </tr>
              </table>
              <div style="border-top: 2px solid #F5F8FB; padding-top: 20px; margin-top: 30px;">
                <p style="margin: 0; color: #0B7897; font-size: 14px; font-weight: 600;">
                  Best regards,<br>
                  The Konfydence Team
                </p>
              </div>
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
          await transporter.sendMail({
            from: `"Konfydence" <${process.env.MAIL_FROM}>`,
            to: memberUser.email,
            subject: `Membership Approved - ${orgName}`,
            html: emailHtml
          });
        }
      } catch (emailError) {
        console.error('Error sending approval email:', emailError);
      }

      res.json({
        message: 'Member request approved successfully. Approval email has been sent.',
        request: request
      });
    } else {
      request.status = 'rejected';
      request.rejectedAt = new Date();
      request.rejectionReason = rejectionReason || 'Request rejected by admin';
      await request.save();

      // Update user
      const memberUser = await User.findById(request.user._id);
      memberUser.memberStatus = 'rejected';
      await memberUser.save();

      res.json({
        message: 'Member request rejected successfully.',
        request: request
      });
    }
  } catch (error) {
    console.error('Error processing member request:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;





