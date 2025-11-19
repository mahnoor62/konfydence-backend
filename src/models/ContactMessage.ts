import mongoose, { Schema, Document } from 'mongoose';

export interface IContactMessage extends Document {
  name: string;
  email: string;
  company?: string;
  topic: 'b2b_demo' | 'b2c_question' | 'education' | 'other';
  message: string;
  status: 'new' | 'read' | 'replied' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

const ContactMessageSchema = new Schema<IContactMessage>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    company: { type: String },
    topic: {
      type: String,
      enum: ['b2b_demo', 'b2c_question', 'education', 'other'],
      required: true
    },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ['new', 'read', 'replied', 'closed'],
      default: 'new'
    }
  },
  { timestamps: true }
);

export default mongoose.model<IContactMessage>('ContactMessage', ContactMessageSchema);

