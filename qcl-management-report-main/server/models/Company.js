const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      unique: true,
    },
    code: {
      type: String,
      required: [true, 'Company code is required'],
      trim: true,
      uppercase: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'maintenance'],
      default: 'active',
    },
    description: {
      type: String,
      default: '',
    },
    industry: {
      type: String,
      default: 'Petrochemicals & Fertilizers',
    },
    established: {
      type: String,
      default: '',
    },
    tagline: {
      type: String,
      default: '',
    },
    hasAnalytics: {
      type: Boolean,
      default: false,
    },
    primaryColor: {
      type: String,
      default: '#1E40AF',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Company', companySchema);
