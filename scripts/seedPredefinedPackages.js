const mongoose = require('mongoose');
require('dotenv').config();
const Package = require('../models/Package');

// Predefined packages data
const predefinedPackages = [
  // B2C Packages
  {
    name: 'Digital Package',
    description: 'Access to digital cards and content',
    type: 'digital',
    packageType: 'digital',
    category: 'digital',
    pricing: {
      amount: 29,
      currency: 'EUR',
      billingType: 'subscription'
    },
    targetAudiences: ['B2C'],
    visibility: 'public',
    status: 'active',
    isPredefined: true,
    maxSeats: 2
  },
  {
    name: 'Physical Cards',
    description: 'Physical cards package',
    type: 'physical',
    packageType: 'physical',
    category: 'physical',
    pricing: {
      amount: 49,
      currency: 'EUR',
      billingType: 'one_time'
    },
    targetAudiences: ['B2C'],
    visibility: 'public',
    status: 'active',
    isPredefined: true,
    maxSeats: 3
  },
  {
    name: 'Digital & Physical Cards',
    description: 'Combined digital and physical cards package',
    type: 'digital_physical',
    packageType: 'digital_physical',
    category: 'digital_physical',
    pricing: {
      amount: 69,
      currency: 'EUR',
      billingType: 'one_time'
    },
    targetAudiences: ['B2C'],
    visibility: 'public',
    status: 'active',
    isPredefined: true,
    maxSeats: 4
  },
  {
    name: 'Digital Renewal',
    description: 'Yearly digital renewal package',
    type: 'renewal',
    packageType: 'renewal',
    category: 'renewal',
    pricing: {
      amount: 2499,
      currency: 'EUR',
      billingType: 'one_time'
    },
    targetAudiences: ['B2C'],
    visibility: 'public',
    status: 'active',
    isPredefined: true,
    maxSeats: 5
  },
  // B2B/B2E Packages
  {
    name: 'Eductional Institutes Name *',
    description: 'Package for educational institutes',
    type: 'standard',
    packageType: 'standard',
    category: 'standard',
    pricing: {
      amount: 22,
      currency: 'EUR',
      billingType: 'one_time'
    },
    targetAudiences: ['B2E'],
    visibility: 'public',
    status: 'active',
    isPredefined: true,
    maxSeats: 5
  },
  {
    name: 'Private Users',
    description: 'Package for private users',
    type: 'standard',
    packageType: 'standard',
    category: 'standard',
    pricing: {
      amount: 89,
      currency: 'EUR',
      billingType: 'one_time'
    },
    targetAudiences: ['B2C'],
    visibility: 'public',
    status: 'active',
    isPredefined: true,
    maxSeats: 5
  }
];

async function seedPredefinedPackages() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/konfydence', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Check if predefined packages already exist
    const existingPredefined = await Package.find({ isPredefined: true });
    if (existingPredefined.length > 0) {
      console.log(`⚠️  Found ${existingPredefined.length} existing predefined packages. Updating them...`);
      
      // Update existing packages to be predefined
      for (const pkg of predefinedPackages) {
        await Package.findOneAndUpdate(
          { name: pkg.name, targetAudiences: pkg.targetAudiences },
          { ...pkg, isPredefined: true },
          { upsert: true, new: true }
        );
      }
      console.log('✅ Updated existing packages to predefined');
    } else {
      // Insert predefined packages
      const result = await Package.insertMany(predefinedPackages);
      console.log(`✅ Created ${result.length} predefined packages`);
    }

    // Mark all existing packages as predefined if they match the names
    for (const pkg of predefinedPackages) {
      await Package.updateMany(
        { name: pkg.name },
        { $set: { isPredefined: true } }
      );
    }

    console.log('✅ Predefined packages seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding predefined packages:', error);
    process.exit(1);
  }
}

seedPredefinedPackages();

