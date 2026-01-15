const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const blogRoutes = require('./routes/blog');
const partnerRoutes = require('./routes/partners');
const leadRoutes = require('./routes/leads');
const contactRoutes = require('./routes/contact');
const uploadRoutes = require('./routes/uploads');

dotenv.config();

const app = express();
const PORT = process.env.PORT

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// CORS Configuration for separate deployments
// const allowedOrigins = [
//   process.env.FRONTEND_URL,
//   process.env.ADMIN_URL,
// ].filter(Boolean);

// app.use(cors({
//   origin: function (origin, callback) {
//     // Allow requests with no origin (like mobile apps or curl requests)
//     if (!origin) return callback(null, true);
    
//     if (allowedOrigins.indexOf(origin) !== -1) {
//       callback(null, true);
//     } else {
//       // In production, you might want to be more strict
//       if (process.env.NODE_ENV === 'development') {
//         callback(null, true); // Allow in development
//       } else {
//         callback(new Error('Not allowed by CORS'));
//       }
//     }
//   },
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control', 'Pragma', 'Expires'],
//   exposedHeaders: ['Content-Range', 'X-Content-Range'],
// }));



const CORS_OPTIONS = process.env.CORS_OPTIONS;
console.log('CORS_OPTIONS', CORS_OPTIONS);
let corsOrigins = [];
if (CORS_OPTIONS) {
    corsOrigins = CORS_OPTIONS.split(',')
}

const corsOptions = {
    origin: corsOrigins,
    optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// CRITICAL: Stripe webhook needs raw body - MUST be before express.json()
// Route path only, NO full URL - Express routes don't use full URLs!
// express.raw() returns Buffer, which Stripe needs for signature verification
app.use('https://konfydence.com/api/payments/webhook', express.raw({ type: 'application/json', limit: '50mb' }));

// JSON parser - applied to all other routes (EXCEPT webhook which uses raw body above)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/konfydence')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/product-types', require('./routes/productTypes'));
app.use('/api/productTypes', require('./routes/productTypes')); // Alias for camelCase compatibility
app.use('/api/partner-types', require('./routes/partnerTypes'));
app.use('/api/badges', require('./routes/badges'));
app.use('/api/blog', blogRoutes);
app.use('/api/blog-categories', require('./routes/blogCategories'));
app.use('/api/blog-tags', require('./routes/blogTags'));
app.use('/api/partners', partnerRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/subscribers', require('./routes/subscribers'));
// Keep backward compatibility
app.use('/api/newsletter', require('./routes/subscribers'));
app.use('/api/uploads', uploadRoutes);
app.use('/api/game-progress', require('./routes/gameProgress'));

// New routes
app.use('/api/cards', require('./routes/cards'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/custom-packages', require('./routes/customPackages'));
app.use('/api/custom-package-requests', require('./routes/customPackageRequests'));
app.use('/api/card-registrations', require('./routes/cardRegistrations'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/schools', require('./routes/schools'));
app.use('/api/users', require('./routes/users'));
app.use('/api/user', require('./routes/userDashboard'));
app.use('/api/user/organizations', require('./routes/userOrganizations'));
app.use('/api/transactions', require('./routes/transactions'));
// Demo routes for predefined demos
app.use('/api/demos', require('./routes/demos'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/migrate', require('./routes/migrateLeads'));
app.use('/api/admin-management', require('./routes/adminManagement'));
app.use('/api/test', require('./routes/testEmail'));
app.use('/api/profile', require('./routes/profileUpload'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/free-trial', require('./routes/freeTrial'));

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});



