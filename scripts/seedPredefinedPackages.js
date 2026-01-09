const mongoose = require('mongoose');
require('dotenv').config();
const Package = require('../models/Package');

// Predefined packages data - 4 packages total
const predefinedPackages = [
  // B2C Packages (2 packages)
  {
    name: 'Digital Package',
    description: 'Access to all digital cards and content. Unlimited digital access to online platform with regular content updates.',
    type: 'digital',
    packageType: 'digital',
    category: 'digital',
    pricing: {
      amount: 29,
      currency: 'USD',
      billingType: 'one_time'
    },
    targetAudiences: ['B2C'],
    visibility: 'public',
    status: 'active',
    isPredefined: true,
    maxSeats: 1, // B2C default: 1
    expiryTime: 1,
    expiryTimeUnit: 'years'
  },
  {
    name: 'Digital + Physical Cards',
    description: 'Everything in Digital Package plus physical card deck. Includes unique reference code included. Best value package with complete access.',
    type: 'digital_physical',
    packageType: 'digital_physical',
    category: 'digital_physical',
    pricing: {
      amount: 69,
      currency: 'USD',
      billingType: 'one_time'
    },
    targetAudiences: ['B2C'],
    visibility: 'public',
    status: 'active',
    isPredefined: true,
    maxSeats: 1, // B2C default: 1
    expiryTime: 1,
    expiryTimeUnit: 'years'
  },
  // B2B/B2E Packages (2 packages)
  {
    name: 'Digital Package',
    description: 'Digital package for organizations. Online access with unique codes for team members.',
    type: 'digital',
    packageType: 'digital',
    category: 'digital',
    pricing: {
      amount: 29,
      currency: 'USD',
      billingType: 'one_time'
    },
    targetAudiences: ['B2B', 'B2E'], // Both B2B and B2E
    visibility: 'public',
    status: 'active',
    isPredefined: true,
    maxSeats: 5, // B2B/B2E default: 5
    expiryTime: 1,
    expiryTimeUnit: 'years'
  },
  {
    name: 'Digital + Physical Cards',
    description: 'Complete bundle: digital access + physical card game kit. Best value for organizations who want both online and offline play.',
    type: 'digital_physical',
    packageType: 'digital_physical',
    category: 'digital_physical',
    pricing: {
      amount: 69,
      currency: 'USD',
      billingType: 'one_time'
    },
    targetAudiences: ['B2B', 'B2E'], // Both B2B and B2E
    visibility: 'public',
    status: 'active',
    isPredefined: true,
    maxSeats: 5, // B2B/B2E default: 5
    expiryTime: 1,
    expiryTimeUnit: 'years'
  }
];

async function seedPredefinedPackages() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/konfydence');
    console.log('✅ Connected to MongoDB');

    // Delete existing predefined packages to start fresh
    const deleteResult = await Package.deleteMany({ isPredefined: true });
    console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing predefined packages`);

    // Insert new predefined packages
    const result = await Package.insertMany(predefinedPackages);
    console.log(`✅ Created ${result.length} predefined packages:`);
    
    result.forEach((pkg, index) => {
      const audience = pkg.targetAudiences.join('/');
      console.log(`   ${index + 1}. ${pkg.name} (${audience}) - ${pkg.packageType} - ${pkg.maxSeats} seats - ${pkg.expiryTime} ${pkg.expiryTimeUnit}`);
    });

    console.log('\n✅ Predefined packages seeded successfully!');
    console.log('\n📦 Package Summary:');
    console.log('   B2C Packages: 2 (Digital, Digital + Physical)');
    console.log('   B2B/B2E Packages: 2 (Digital, Digital + Physical)');
    console.log('   All packages: 1 year expiry, predefined, active');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding predefined packages:', error);
    process.exit(1);
  }
}

seedPredefinedPackages();
