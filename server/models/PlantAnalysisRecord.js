const mongoose = require('mongoose');

const plantAnalysisRecordSchema = new mongoose.Schema(
  {
    plant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plant',
      default: null,
    },
    plantName: {
      type: String,
      required: [true, 'Plant name is required'],
      trim: true,
      index: true,
    },
    plantCode: {
      type: String,
      required: [true, 'Plant code is required'],
      trim: true,
      uppercase: true,
      index: true,
    },
    analysisType: {
      type: String,
      required: [true, 'Analysis type is required'],
      trim: true,
      index: true,
    },
    unit: {
      type: String,
      default: '',
      trim: true,
    },
    date: {
      type: String,
      required: [true, 'Date is required'],
      index: true,
      trim: true,
    },
    shift: {
      type: String,
      default: '',
      trim: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    submittedBy: {
      type: String,
      default: 'Plant Administrator',
      trim: true,
    },
    submittedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },
    emailRecipient: {
      type: String,
      default: '',
      trim: true,
    },
    emailStatus: {
      type: String,
      enum: ['Pending', 'Sent', 'Failed', 'Skipped'],
      default: 'Pending',
    },
    emailMessageId: {
      type: String,
      default: '',
    },
    reportFileName: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient lookup by plant, analysisType and date
plantAnalysisRecordSchema.index({ plantCode: 1, analysisType: 1, date: 1 });

module.exports = mongoose.model('PlantAnalysisRecord', plantAnalysisRecordSchema);
