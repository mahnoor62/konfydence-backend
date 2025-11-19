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
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model<IProduct>('Product', ProductSchema);

