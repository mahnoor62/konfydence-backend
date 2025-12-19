const mongoose = require('mongoose');
const Package = require('../models/Package');
require('dotenv').config();

// B2C Predefined Packages
const B2C_PACKAGES = [
  {
    name: 'Digital Package',
    description: 'Access to all digital cards and content\nUnlimited digital access\nOnline platform access\nRegular content updates',
    packageType: 'digital',
    type: 'digital',
    category: 'digital',
    pricing: {
      amount: 29,
      currency: 'EUR',
      billingType: 'subscription'
    },
    targetAudiences: ['B2C'],
    status: 'active',
    visibility: 'public',
    isPredefined: true,
    maxSeats: 2
  },
  {
    name: 'Physical Cards',
    description: 'Physical card deck delivered to your address\nUnique reference code for registration\n2 months free digital access with registration\nHigh-quality printed cards',
    packageType: 'physical',
    type: 'physical',
    category: 'physical',
    pricing: {
      amount: 49,
      currency: 'EUR',
      billingType: 'one_time'
    },
    targetAudiences: ['B2C'],
    status: 'active',
    visibility: 'public',
    isPredefined: true,
    maxSeats: 3
  },
  {
    name: 'Digital & Physical Cards',
    description: 'Everything in Digital Package\nPlus physical card deck\nUnique reference code included\nBest value package',
    packageType: 'digital_physical',
    type: 'digital_physical',
    category: 'digital_physical',
    pricing: {
      amount: 69,
      currency: 'EUR',
      billingType: 'one_time'
    },
    targetAudiences: ['B2C'],
    status: 'active',
    visibility: 'public',
    isPredefined: true,
    maxSeats: 4
  },
  {
    name: 'Digital Renewal',
    description: 'Annual renewal for digital access\nAll digital cards and content\nRegular updates throughout the year\nBest value for long-term access',
    packageType: 'renewal',
    type: 'renewal',
    category: 'renewal',
    pricing: {
      amount: 2499,
      currency: 'EUR',
      billingType: 'one_time'
    },
    targetAudiences: ['B2C'],
    status: 'active',
    visibility: 'public',
    isPredefined: true,
    maxSeats: 5
  }
];

async function createB2CPackages() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/konfydence');
    console.log('Connected to MongoDB');

    for (const pkgData of B2C_PACKAGES) {
      const existing = await Package.findOne({ 
        name: pkgData.name,
        targetAudiences: pkgData.targetAudiences 
      });

      if (existing) {
        // Update existing package to be predefined
        existing.isPredefined = true;
        await existing.save();
        console.log(`✅ Updated package "${pkgData.name}" to predefined`);
        continue;
      }

      const pkg = await Package.create(pkgData);
      console.log(`✅ Created predefined package: ${pkg.name} (€${pkg.pricing.amount})`);
    }

    // Mark all existing packages with matching names as predefined
    const packageNames = B2C_PACKAGES.map(p => p.name);
    await Package.updateMany(
      { name: { $in: packageNames } },
      { $set: { isPredefined: true } }
    );
    console.log('✅ Marked existing packages as predefined');

    console.log('✅ B2C packages created successfully!');
  } catch (error) {
    console.error('❌ Error creating B2C packages:', error);
    throw error;
  }
}

// B2B/B2E Predefined Packages
const B2B_B2E_PACKAGES = [
  {
    name: 'Eductional Institutes Name *',
    description: 'Package for educational institutes',
    packageType: 'standard',
    type: 'standard',
    category: 'standard',
    pricing: {
      amount: 22,
      currency: 'EUR',
      billingType: 'one_time'
    },
    targetAudiences: ['B2E'],
    status: 'active',
    visibility: 'public',
    isPredefined: true,
    maxSeats: 5
  },
  {
    name: 'Private Users',
    description: 'Package for private users',
    packageType: 'standard',
    type: 'standard',
    category: 'standard',
    pricing: {
      amount: 89,
      currency: 'EUR',
      billingType: 'one_time'
    },
    targetAudiences: ['B2C'],
    status: 'active',
    visibility: 'public',
    isPredefined: true,
    maxSeats: 5
  },
  {
    name: 'Business Standard Package',
    description: 'Standard package for businesses',
    packageType: 'standard',
    type: 'standard',
    category: 'standard',
    pricing: {
      amount: 199,
      currency: 'EUR',
      billingType: 'one_time'
    },
    targetAudiences: ['B2B'],
    status: 'active',
    visibility: 'public',
    isPredefined: true,
    maxSeats: 10
  },
  {
    name: 'Educational Premium Package',
    description: 'Premium package for educational institutes',
    packageType: 'standard',
    type: 'standard',
    category: 'standard',
    pricing: {
      amount: 299,
      currency: 'EUR',
      billingType: 'subscription'
    },
    targetAudiences: ['B2E'],
    status: 'active',
    visibility: 'public',
    isPredefined: true,
    maxSeats: 20
  },
  {
    name: 'Business Enterprise Package',
    description: 'Enterprise package for large businesses',
    packageType: 'standard',
    type: 'standard',
    category: 'standard',
    pricing: {
      amount: 499,
      currency: 'EUR',
      billingType: 'subscription'
    },
    targetAudiences: ['B2B'],
    status: 'active',
    visibility: 'public',
    isPredefined: true,
    maxSeats: 50
  }
];

async function createB2B_B2E_Packages() {
  try {
    console.log('📦 Creating B2B/B2E predefined packages...');

    for (const pkgData of B2B_B2E_PACKAGES) {
      const existing = await Package.findOne({ 
        name: pkgData.name,
        targetAudiences: pkgData.targetAudiences 
      });

      if (existing) {
        // Update existing package to be predefined
        existing.isPredefined = true;
        await existing.save();
        console.log(`✅ Updated package "${pkgData.name}" to predefined`);
        continue;
      }

      const pkg = await Package.create(pkgData);
      console.log(`✅ Created predefined package: ${pkg.name} (€${pkg.pricing.amount})`);
    }

    // Mark all existing packages with matching names as predefined
    const packageNames = B2B_B2E_PACKAGES.map(p => p.name);
    await Package.updateMany(
      { name: { $in: packageNames } },
      { $set: { isPredefined: true } }
    );
    console.log('✅ Marked existing B2B/B2E packages as predefined');
  } catch (error) {
    console.error('❌ Error creating B2B/B2E packages:', error);
    throw error;
  }
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/konfydence');
    console.log('✅ Connected to MongoDB');

    await createB2CPackages();
    await createB2B_B2E_Packages();

    console.log('✅ All predefined packages created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();









