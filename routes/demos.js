const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const Demo = require('../models/Demo');
const FreeTrial = require('../models/FreeTrial');
const User = require('../models/User');
const Product = require('../models/Product');
const Package = require('../models/Package');
const Card = require('../models/Card');

const router = express.Router();

// Get predefined demos (public endpoint)
router.get('/', async (req, res) => {
  try {
    const { targetAudience } = req.query;
    
    const query = { isActive: true };
    if (targetAudience) {
      query.targetAudience = targetAudience;
    }
    
    const demos = await Demo.find(query).sort({ targetAudience: 1, createdAt: 1 });
    
    res.json(demos);
  } catch (error) {
    console.error('Error fetching demos:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get demo by target audience
router.get('/by-audience/:targetAudience', async (req, res) => {
  try {
    const { targetAudience } = req.params;
    
    if (!['B2C', 'B2B', 'B2E'].includes(targetAudience)) {
      return res.status(400).json({ error: 'Invalid target audience. Must be B2C, B2B, or B2E' });
    }
    
    const demo = await Demo.findOne({ 
      targetAudience, 
      isActive: true 
    });
    
    if (!demo) {
      return res.status(404).json({ error: 'Demo not found for this target audience' });
    }
    
    res.json(demo);
  } catch (error) {
    console.error('Error fetching demo:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create demo for user (requires authentication)
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { targetAudience, productId } = req.body;
    
    if (!targetAudience) {
      return res.status(400).json({ error: 'Target audience is required' });
    }
    
    if (!['B2C', 'B2B', 'B2E'].includes(targetAudience)) {
      return res.status(400).json({ error: 'Invalid target audience. Must be B2C, B2B, or B2E' });
    }
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get predefined demo configuration
    let demoConfig = await Demo.findOne({ 
      targetAudience, 
      isActive: true 
    });
    
    // If demo config doesn't exist, create a default one
    if (!demoConfig) {
      try {
        const defaultConfigs = {
          'B2C': { duration: 14, seats: 2, cardQuantity: 30, name: 'B2C Demo', description: '14-day demo for B2C users with 2 seats and 30 cards' },
          'B2B': { duration: 14, seats: 2, cardQuantity: 90, name: 'B2B Demo', description: '14-day demo for B2B users with 2 seats and 90 cards' },
          'B2E': { duration: 14, seats: 2, cardQuantity: 90, name: 'B2E Demo', description: '14-day demo for B2E users with 2 seats and 90 cards' }
        };
        
        const defaultConfig = defaultConfigs[targetAudience];
        if (defaultConfig) {
          demoConfig = await Demo.create({
            targetAudience,
            duration: defaultConfig.duration,
            seats: defaultConfig.seats,
            cardQuantity: defaultConfig.cardQuantity,
            name: defaultConfig.name,
            description: defaultConfig.description,
            isActive: true,
            isPredefined: true,
          });
          console.log(`✅ Auto-created default demo config for ${targetAudience}`);
        } else {
          console.error(`❌ Invalid target audience: ${targetAudience}`);
          return res.status(400).json({ 
            error: `Invalid target audience: ${targetAudience}. Must be B2C, B2B, or B2E.` 
          });
        }
      } catch (createError) {
        console.error(`❌ Error auto-creating demo config for ${targetAudience}:`, createError);
        // Try to find it again in case it was created by another request
        demoConfig = await Demo.findOne({ 
          targetAudience, 
          isActive: true 
        });
        
        if (!demoConfig) {
          return res.status(500).json({ 
            error: `Failed to create demo configuration for ${targetAudience}. Please contact support.` 
          });
        }
      }
    }
    
    // Check if user already has an active demo
    const existingDemo = await FreeTrial.findOne({
      userId: req.userId,
      status: 'active',
      endDate: { $gt: new Date() },
      targetAudience: targetAudience, // Check by target audience
    });
    
    if (existingDemo) {
      return res.status(400).json({ 
        error: 'You already have an active demo',
        trial: existingDemo,
      });
    }
    
    // Generate unique code
    const generateUniqueCode = () => {
      const getRandomDigits = (length) => {
        return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
      };
      
      const getRandomLetters = (length) => {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return Array.from({ length }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
      };
      
      const part1 = getRandomDigits(4);
      const part2 = getRandomLetters(3) + getRandomDigits(1);
      const part3 = getRandomLetters(1) + getRandomDigits(3);
      
      return `${part1}-${part2}-${part3}`;
    };
    
    let uniqueCode = generateUniqueCode();
    let codeExists = await FreeTrial.findOne({ uniqueCode });
    while (codeExists) {
      uniqueCode = generateUniqueCode();
      codeExists = await FreeTrial.findOne({ uniqueCode });
    }
    
    // Calculate end date based on demo duration - always 14 days for demos (including current day)
    // Use milliseconds to ensure accuracy (avoiding setDate issues with month boundaries)
    const startDate = new Date();
    
    // Calculate exactly 14 days including current day = 13 days added to start date
    // Example: If start is Jan 1, end is Jan 14 (14 days total: Jan 1, 2, 3...14)
    // Set endDate to end of day (23:59:59) so user can play on the last day
    const thirteenDaysInMs = 13 * 24 * 60 * 60 * 1000;
    endDate = new Date(startDate.getTime() + thirteenDaysInMs);
    endDate.setHours(23, 59, 59, 999); // Set to end of day so user can play on the 14th day
    
    // Verify the calculation (safeguard - ensure exactly 14 days including start day)
    const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1; // +1 to include start day
    if (daysDiff !== 14) {
      console.error(`❌ Error: End date calculation resulted in ${daysDiff} days instead of 14. Recalculating...`);
      // Force recalculate using milliseconds
      const thirteenDaysInMs = 13 * 24 * 60 * 60 * 1000;
      endDate = new Date(startDate.getTime() + thirteenDaysInMs);
      endDate.setHours(23, 59, 59, 999);
    }
    
    // Final verification before saving
    const finalDaysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1; // +1 to include start day
    console.log(`📅 Demo date calculation: startDate=${startDate.toISOString()}, endDate=${endDate.toISOString()}, duration=${finalDaysDiff} days (should be 14, including start day)`);
    
    if (finalDaysDiff !== 14) {
      console.error(`❌ CRITICAL: End date is still ${finalDaysDiff} days! Forcing to 14 days...`);
      const thirteenDaysInMs = 13 * 24 * 60 * 60 * 1000;
      endDate = new Date(startDate.getTime() + thirteenDaysInMs);
      endDate.setHours(23, 59, 59, 999);
    }
    
    // Get package or product for demo
    let packageId = null;
    if (productId) {
      const product = await Product.findById(productId);
      if (product) {
        // For B2C, we might need to find a default package or create one
        // For now, we'll use productId directly in FreeTrial
      }
    }
    
    // Find a suitable package for this target audience
    if (!packageId) {
      const packageQuery = { 
        status: 'active',
        visibility: 'public'
      };
      
      if (targetAudience === 'B2C') {
        packageQuery.targetAudiences = 'B2C';
      } else if (targetAudience === 'B2B') {
        packageQuery.targetAudiences = 'B2B';
      } else if (targetAudience === 'B2E') {
        packageQuery.targetAudiences = 'B2E';
      }
      
      const defaultPackage = await Package.findOne(packageQuery);
      if (defaultPackage) {
        packageId = defaultPackage._id;
      }
    }
    
    // Create free trial with demo configuration
    // Use the calculated startDate and endDate
    const finalStartDate = new Date(startDate);
    const finalEndDate = new Date(endDate); // Use the already calculated endDate with proper 14 days
    
    const finalCheckDays = Math.round((finalEndDate.getTime() - finalStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1; // +1 to include start day
    console.log(`🔍 Final check before save: startDate=${finalStartDate.toISOString()}, endDate=${finalEndDate.toISOString()}, days=${finalCheckDays} (including start day)`);
    
    if (finalCheckDays !== 14) {
      console.error(`❌ CRITICAL ERROR: Final check shows ${finalCheckDays} days instead of 14! Recalculating...`);
      // Recalculate to ensure 14 days
      const thirteenDaysInMs = 13 * 24 * 60 * 60 * 1000;
      const recalculatedEndDate = new Date(finalStartDate.getTime() + thirteenDaysInMs);
      recalculatedEndDate.setHours(23, 59, 59, 999);
      finalEndDate.setTime(recalculatedEndDate.getTime());
      console.log(`✅ Recalculated endDate: ${finalEndDate.toISOString()}`);
    }
    
    const freeTrial = await FreeTrial.create({
      userId: req.userId,
      organizationId: user.organizationId || null,
      packageId: packageId,
      productId: productId || null,
      uniqueCode: uniqueCode,
      startDate: finalStartDate, // Use calculated startDate
      endDate: finalEndDate, // Always 14 days from startDate for demos
      maxSeats: demoConfig.seats,
      usedSeats: 0,
      status: 'active',
      targetAudience: targetAudience, // Store target audience for filtering
      cardQuantity: demoConfig.cardQuantity, // Store card quantity for this demo
      isDemo: true, // Mark as demo user (created via demo request)
    });
    
    // Verify what was actually saved
    const savedTrial = await FreeTrial.findById(freeTrial._id);
    const savedDaysDiff = Math.round((new Date(savedTrial.endDate) - new Date(savedTrial.startDate)) / (1000 * 60 * 60 * 24)) + 1; // +1 to include start day
    console.log(`✅ Demo created: code=${uniqueCode}, targetAudience=${targetAudience}`);
    console.log(`📊 Saved dates: startDate=${savedTrial.startDate.toISOString()}, endDate=${savedTrial.endDate.toISOString()}, duration=${savedDaysDiff} days (including start day)`);
    
    if (savedDaysDiff !== 14) {
      console.error(`❌ WARNING: Saved trial has ${savedDaysDiff} days instead of 14!`);
    }
    
    res.status(201).json({
      message: 'Demo created successfully',
      trial: freeTrial,
      demoConfig: {
        duration: demoConfig.duration,
        seats: demoConfig.seats,
        cardQuantity: demoConfig.cardQuantity,
      }
    });
  } catch (error) {
    console.error('Error creating demo:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Check if user has used demo (for B2C)
router.get('/has-used-demo', authenticateToken, async (req, res) => {
  try {
    const { targetAudience } = req.query;
    
    const query = { userId: req.userId };
    if (targetAudience) {
      query.targetAudience = targetAudience;
    }
    
    const hasUsedDemo = await FreeTrial.exists(query);
    
    res.json({ hasUsedDemo: !!hasUsedDemo });
  } catch (error) {
    console.error('Error checking demo usage:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Create predefined demo
router.post('/admin/create', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }
    
    const { targetAudience, duration, seats, cardQuantity, name, description } = req.body;
    
    if (!targetAudience || !['B2C', 'B2B', 'B2E'].includes(targetAudience)) {
      return res.status(400).json({ error: 'Valid target audience (B2C, B2B, or B2E) is required' });
    }
    
    if (!cardQuantity || cardQuantity < 1) {
      return res.status(400).json({ error: 'Card quantity must be at least 1' });
    }
    
    // Check if demo already exists for this target audience
    const existingDemo = await Demo.findOne({ targetAudience, isActive: true });
    if (existingDemo) {
      return res.status(400).json({ 
        error: `Demo already exists for ${targetAudience}. Please update or deactivate the existing one.` 
      });
    }
    
    const demo = await Demo.create({
      targetAudience,
      duration: duration || 14,
      seats: seats || 2,
      cardQuantity,
      name: name || `${targetAudience} Demo`,
      description: description || '',
      isActive: true,
      isPredefined: true,
    });
    
    res.status(201).json({
      message: 'Demo created successfully',
      demo,
    });
  } catch (error) {
    console.error('Error creating demo:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;

