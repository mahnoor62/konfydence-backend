// Script to drop the old email_1 unique index from newsletters collection
// Run this once: node scripts/drop-email-index.js

const mongoose = require('mongoose');
require('dotenv').config();

async function dropOldIndex() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/konfydence');
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('newsletters');

    // Check existing indexes
    const indexes = await collection.indexes();
    console.log('\n📋 Current indexes:', JSON.stringify(indexes, null, 2));

    // Drop the email_1 index if it exists
    try {
      await collection.dropIndex('email_1');
      console.log('\n✅ Successfully dropped email_1 index');
    } catch (err) {
      if (err.codeName === 'IndexNotFound') {
        console.log('\nℹ️  email_1 index does not exist (already dropped or never created)');
      } else {
        throw err;
      }
    }

    // List indexes after dropping
    const indexesAfter = await collection.indexes();
    console.log('\n📋 Indexes after drop:', JSON.stringify(indexesAfter, null, 2));

    await mongoose.connection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

dropOldIndex();

