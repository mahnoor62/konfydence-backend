import mongoose, { Schema, Document } from 'mongoose';

export interface IB2BLead extends Document {
  name: string;
  company: string;
  email: string;
  employeeCount?: string;
  message?: string;
  status: 'new' | 'contacted' | 'qualified' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

const B2BLeadSchema = new Schema<IB2BLead>(
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

export default mongoose.model<IB2BLead>('B2BLead', B2BLeadSchema);

