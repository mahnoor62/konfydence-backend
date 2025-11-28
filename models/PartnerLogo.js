const mongoose = require('mongoose');
const { Schema } = mongoose;

const PartnerLogoSchema = new Schema(
  {
    name: { type: String, required: true },
    logoUrl: { type: String, required: true },
    linkUrl: { type: String },
    type: { type: String, required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PartnerLogo', PartnerLogoSchema);
