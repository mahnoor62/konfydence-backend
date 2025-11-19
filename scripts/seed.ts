import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import Admin from '../models/Admin';

dotenv.config();

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('Connected to MongoDB');

    const email = process.env.ADMIN_EMAIL || 'admin@konfydence.com';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const name = process.env.ADMIN_NAME || 'Admin';

    const existing = await Admin.findOne({ email });
    if (existing) {
      console.log('Admin already exists');
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await Admin.create({
      email,
      passwordHash,
      name,
      isActive: true,
    });

    console.log('✅ Admin created successfully!');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Name: ${name}`);
    process.exit(0);
  } catch (error) {
    console.error('Error seeding:', error);
    process.exit(1);
  }
}

seed();

