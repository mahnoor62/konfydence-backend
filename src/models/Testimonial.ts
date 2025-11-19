import mongoose, { Schema, Document } from 'mongoose';

export interface ITestimonial extends Document {
  name: string;
  role: string;
  organization: string;
  quote: string;
  segment: 'b2b' | 'b2c' | 'b2e';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TestimonialSchema = new Schema<ITestimonial>(
  {
    name: { type: String, required: true },
    role: { type: String, required: true },
    organization: { type: String, required: true },
    quote: { type: String, required: true },
    segment: {
      type: String,
      enum: ['b2b', 'b2c', 'b2e'],
      required: true
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model<ITestimonial>('Testimonial', TestimonialSchema);

