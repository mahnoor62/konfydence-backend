const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const blogRoutes = require('./routes/blog');
const testimonialRoutes = require('./routes/testimonials');
const partnerRoutes = require('./routes/partners');
const leadRoutes = require('./routes/leads');
const contactRoutes = require('./routes/contact');
const settingsRoutes = require('./routes/settings');
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
app.use('/api/badges', require('./routes/badges'));
app.use('/api/blog', blogRoutes);
app.use('/api/blog-categories', require('./routes/blogCategories'));
app.use('/api/blog-tags', require('./routes/blogTags'));
app.use('/api/testimonials', testimonialRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/uploads', uploadRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});



