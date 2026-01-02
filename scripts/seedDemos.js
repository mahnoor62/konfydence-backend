const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Demo = require('../models/Demo');

dotenv.config();

const seedDemos = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/konfydence');
    console.log('✅ Connected to MongoDB');

    // Clear existing demos (optional - comment out if you want to keep existing)
    // await Demo.deleteMany({});
    // console.log('🗑️  Cleared existing demos');

    // Check if demos already exist
    const existingB2C = await Demo.findOne({ targetAudience: 'B2C', isActive: true });
    const existingB2B = await Demo.findOne({ targetAudience: 'B2B', isActive: true });
    const existingB2E = await Demo.findOne({ targetAudience: 'B2E', isActive: true });

    const demos = [];

    // B2C Demo: 14 days, 2 seats, 30 cards
    if (!existingB2C) {
      demos.push({
        targetAudience: 'B2C',
        duration: 14,
        seats: 2,
        cardQuantity: 30,
        name: 'B2C Demo',
        description: '14-day demo for B2C users with 2 seats and 30 cards',
        isActive: true,
        isPredefined: true,
      });
      console.log('📝 Created B2C demo config');
    } else {
      console.log('ℹ️  B2C demo already exists, skipping...');
    }

    // B2B Demo: 14 days, 2 seats, 90 cards
    if (!existingB2B) {
      demos.push({
        targetAudience: 'B2B',
        duration: 14,
        seats: 2,
        cardQuantity: 90,
        name: 'B2B Demo',
        description: '14-day demo for B2B users with 2 seats and 90 cards',
        isActive: true,
        isPredefined: true,
      });
      console.log('📝 Created B2B demo config');
    } else {
      console.log('ℹ️  B2B demo already exists, skipping...');
    }

    // B2E Demo: 14 days, 2 seats, 90 cards
    if (!existingB2E) {
      demos.push({
        targetAudience: 'B2E',
        duration: 14,
        seats: 2,
        cardQuantity: 90,
        name: 'B2E Demo',
        description: '14-day demo for B2E users with 2 seats and 90 cards',
        isActive: true,
        isPredefined: true,
      });
      console.log('📝 Created B2E demo config');
    } else {
      console.log('ℹ️  B2E demo already exists, skipping...');
    }

    if (demos.length > 0) {
      await Demo.insertMany(demos);
      console.log(`✅ Successfully seeded ${demos.length} demo(s)`);
    } else {
      console.log('✅ All demos already exist, nothing to seed');
    }

    // Display all active demos
    const allDemos = await Demo.find({ isActive: true });
    console.log('\n📋 Active Demos:');
    allDemos.forEach(demo => {
      console.log(`  - ${demo.targetAudience}: ${demo.duration} days, ${demo.seats} seats, ${demo.cardQuantity} cards`);
    });

    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding demos:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

seedDemos();


