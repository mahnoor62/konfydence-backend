const mongoose = require('mongoose');
const { Schema } = mongoose;

const EducationLeadSchema = new Schema(
  {
    // New format fields
    name: { type: String, required: true },
    school: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: String },
    message: { type: String },
    lead_type: { type: String, default: 'b2e' },
    // Legacy fields for backward compatibility
    schoolName: { type: String },
    contactName: { type: String },
    cityCountry: { type: String },
    status: {
      type: String,
      enum: ['new', 'contacted', 'qualified', 'closed'],
      default: 'new'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('EducationLead', EducationLeadSchema);
