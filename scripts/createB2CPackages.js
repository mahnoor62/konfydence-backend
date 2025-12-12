const mongoose = require('mongoose');
const Package = require('../models/Package');
require('dotenv').config();

const B2C_PACKAGES = [
  {
    name: 'Digital Package',
    description: 'Access to all digital cards and content\nUnlimited digital access\nOnline platform access\nRegular content updates',
    packageType: 'digital',
    type: 'digital',
    pricing: {
      amount: 29,
      currency: 'EUR',
      billingType: 'one_time'
    },
    status: 'active',
    visibility: 'public'
  },
  {
    name: 'Physical Cards Package',
    description: 'Physical card deck delivered to your address\nUnique reference code for registration\n2 months free digital access with registration\nHigh-quality printed cards',
    packageType: 'physical',
    type: 'physical',
    pricing: {
      amount: 49,
      currency: 'EUR',
      billingType: 'one_time'
    },
    status: 'active',
    visibility: 'public'
  },
  {
    name: 'Digital + Physical Cards Package',
    description: 'Everything in Digital Package\nPlus physical card deck\nUnique reference code included\nBest value package',
    packageType: 'digital_physical',
    type: 'digital_physical',
    pricing: {
      amount: 69,
      currency: 'EUR',
      billingType: 'one_time'
    },
    status: 'active',
    visibility: 'public'
  },
  {
    name: 'Yearly Digital Renewal',
    description: 'Annual renewal for digital access\nAll digital cards and content\nRegular updates throughout the year\nBest value for long-term access',
    packageType: 'renewal',
    type: 'renewal',
    pricing: {
      amount: 24.99,
      currency: 'EUR',
      billingType: 'subscription'
    },
    status: 'active',
    visibility: 'public'
  }
];

async function createB2CPackages() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/konfydence');
    console.log('Connected to MongoDB');

    for (const pkgData of B2C_PACKAGES) {
      const existing = await Package.findOne({ 
        name: pkgData.name,
        packageType: pkgData.packageType 
      });

      if (existing) {
        console.log(`Package "${pkgData.name}" already exists, skipping...`);
        continue;
      }

      const pkg = await Package.create(pkgData);
      console.log(`Created package: ${pkg.name} (€${pkg.pricing.amount})`);
    }

    console.log('B2C packages created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating packages:', error);
    process.exit(1);
  }
}

createB2CPackages();






