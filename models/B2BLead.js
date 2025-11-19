const mongoose = require('mongoose');
const { Schema } = mongoose;

const B2BLeadSchema = new Schema(
  {
    name: { type: String, required: true },
    company: { type: String, required: true },
    email: { type: String, required: true },
    employeeCount: { type: String },
    message: { type: String },
    status: {
      type: String,
      enum: ['new', 'contacted', 'qualified', 'closed'],
      default: 'new'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('B2BLead', B2BLeadSchema);
