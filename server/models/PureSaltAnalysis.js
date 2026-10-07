const mongoose = require('mongoose');

const pureSaltAnalysisSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: [true, 'Analysis date is required'],
      index: true,
      trim: true,
    },
    plant: {
      type: String,
      default: 'ACL',
      trim: true,
    },
    analysisType: {
      type: String,
      default: 'Pure Salt Analysis',
      trim: true,
    },
    shift: {
      type: String,
      default: 'All Shifts (I, II, III)',
      trim: true,
    },
    rows: {
      rawSalt: {
        nacl: { type: Number, default: null },
        ca: { type: Number, default: null },
        mg: { type: Number, default: null },
        so4: { type: Number, default: null },
        ir: { type: Number, default: null },
        h2o: { type: Number, default: null },
      },
      shift1: {
        nacl: { type: Number, default: null },
        ca: { type: Number, default: null },
        mg: { type: Number, default: null },
        so4: { type: Number, default: null },
        ir: { type: Number, default: null },
        h2o: { type: Number, default: null },
      },
      shift2: {
        nacl: { type: Number, default: null },
        ca: { type: Number, default: null },
        mg: { type: Number, default: null },
        so4: { type: Number, default: null },
        ir: { type: Number, default: null },
        h2o: { type: Number, default: null },
      },
      shift3: {
        nacl: { type: Number, default: null },
        ca: { type: Number, default: null },
        mg: { type: Number, default: null },
        so4: { type: Number, default: null },
        ir: { type: Number, default: null },
        h2o: { type: Number, default: null },
      },
      composition: {
        nacl: { type: Number, default: null },
        ca: { type: Number, default: null },
        mg: { type: Number, default: null },
        so4: { type: Number, default: null },
        ir: { type: Number, default: null },
        h2o: { type: Number, default: null },
      },
    },
    submittedBy: {
      type: String,
      default: 'Plant Operator',
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
    savedAt: {
      type: Date,
      default: Date.now,
    },
    emailRecipient: {
      type: String,
      trim: true,
      default: '',
    },
    emailStatus: {
      type: String,
      enum: ['Pending', 'Sent', 'Failed', 'Skipped', 'pending', 'sent', 'failed', 'skipped'],
      default: 'pending',
    },
    reportFileName: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('PureSaltAnalysis', pureSaltAnalysisSchema);
