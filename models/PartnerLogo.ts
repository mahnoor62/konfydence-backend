import mongoose, { Schema, Document } from 'mongoose';

export interface IPartnerLogo extends Document {
  name: string;
  logoUrl: string;
  linkUrl?: string;
  type: 'press' | 'partner' | 'event';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PartnerLogoSchema = new Schema<IPartnerLogo>(
  {
    name: { type: String, required: true },
    logoUrl: { type: String, required: true },
    linkUrl: { type: String },
    type: {
      type: String,
      enum: ['press', 'partner', 'event'],
      required: true
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model<IPartnerLogo>('PartnerLogo', PartnerLogoSchema);

