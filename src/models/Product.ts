import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  slug: string;
  description: string;
  price: number;
  type: 'starter' | 'bundle' | 'membership';
  isActive: boolean;
  imageUrl: string;
  badges?: string[];
  sortOrder: number;
  isFeatured?: boolean;
  category?: 'private-users' | 'schools' | 'businesses';
  ctaText?: string;
  ctaHref?: string;
  buttonColor?: string;
  pricingInfo?: {
    primary?: string;
    secondary?: string;
    label?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    type: {
      type: String,
      enum: ['starter', 'bundle', 'membership'],
      required: true
    },
    isActive: { type: Boolean, default: true },
    imageUrl: { type: String, required: true },
    badges: [{ type: String }],
    sortOrder: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    category: {
      type: String,
      enum: ['private-users', 'schools', 'businesses'],
      required: false
    },
    ctaText: { type: String },
    ctaHref: { type: String },
    buttonColor: { type: String },
    pricingInfo: {
      primary: { type: String },
      secondary: { type: String },
      label: { type: String }
    }
  },
  { timestamps: true }
);

export default mongoose.model<IProduct>('Product', ProductSchema);

