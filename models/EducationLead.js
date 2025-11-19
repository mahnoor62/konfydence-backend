const mongoose = require('mongoose');
const { Schema } = mongoose;

const EducationLeadSchema = new Schema(
  {
    schoolName: { type: String, required: true },
    contactName: { type: String, required: true },
    role: { type: String, required: true },
    email: { type: String, required: true },
    cityCountry: { type: String, required: true },
    message: { type: String },
    status: {
      type: String,
      enum: ['new', 'contacted', 'qualified', 'closed'],
      default: 'new'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('EducationLead', EducationLeadSchema);
