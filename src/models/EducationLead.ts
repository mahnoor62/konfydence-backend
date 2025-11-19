import mongoose, { Schema, Document } from 'mongoose';

export interface IEducationLead extends Document {
  schoolName: string;
  contactName: string;
  role: string;
  email: string;
  cityCountry: string;
  message?: string;
  status: 'new' | 'contacted' | 'qualified' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

const EducationLeadSchema = new Schema<IEducationLead>(
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

export default mongoose.model<IEducationLead>('EducationLead', EducationLeadSchema);

