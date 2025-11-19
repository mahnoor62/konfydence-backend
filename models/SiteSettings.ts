import mongoose, { Schema, Document } from 'mongoose';

export interface ISiteSettings extends Document {
  heroB2CTitle: string;
  heroB2CSubtext: string;
  heroB2BTitle: string;
  heroB2BSubtext: string;
  heroEducationTitle: string;
  heroEducationSubtext: string;
  tagline: string;
  metaTitle: string;
  metaDescription: string;
  founderQuote?: string;
  founderName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SiteSettingsSchema = new Schema<ISiteSettings>(
  {
    heroB2CTitle: { type: String, default: 'Outsmart Scams. Build Digital Confidence.' },
    heroB2CSubtext: { type: String, default: 'Interactive training kits and digital learning for every generation.' },
    heroB2BTitle: { type: String, default: 'Compliance that engages. Awareness that lasts.' },
    heroB2BSubtext: { type: String, default: 'CoMaSy transforms compliance training into engaging simulations.' },
    heroEducationTitle: { type: String, default: 'Empower Students Against Digital Deception.' },
    heroEducationSubtext: { type: String, default: 'The Youth Pack brings media literacy to life – aligned with KMK Digital Strategy.' },
    tagline: { type: String, default: 'Prevention is the strongest protection.' },
    metaTitle: { type: String, default: 'Konfydence - Scam Prevention & Compliance Training' },
    metaDescription: { type: String, default: 'Interactive training kits and digital learning for scam prevention and compliance.' },
    founderQuote: { type: String },
    founderName: { type: String }
  },
  { timestamps: true }
);

SiteSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

export default mongoose.model<ISiteSettings>('SiteSettings', SiteSettingsSchema);

