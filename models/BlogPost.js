const mongoose = require('mongoose');
const { Schema } = mongoose;

const BlogPostSchema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    excerpt: { type: String, required: true },
    content: { type: String, required: true },
    featuredImage: { type: String },
    category: {
      type: String,
      enum: [
        'for-families', 
        'for-companies', 
        'for-schools', 
        'news', 
        'how-to',
        'kids-program',
        'charity-model',
        'auditors',
        'nis2',
        'comasi',
        'b2b-sales'
      ],
      required: true,
      default: 'news'
    },
    publishedAt: { type: Date },
    isPublished: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('BlogPost', BlogPostSchema);
