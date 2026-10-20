const mongoose = require('mongoose');

const pureSaltSieveAnalysisSchema = new mongoose.Schema(
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
      default: 'Pure Salt Sieve Analysis',
      trim: true,
    },
    shift: {
      type: String,
      default: 'All Shifts (I, II, III)',
      trim: true,
    },
    rows: {
      shift1: {
        p18:  { type: Number, default: null },
        p44:  { type: Number, default: null },
        p60:  { type: Number, default: null },
        p100: { type: Number, default: null },
        m100: { type: Number, default: null },
      },
      shift2: {
        p18:  { type: Number, default: null },
        p44:  { type: Number, default: null },
        p60:  { type: Number, default: null },
        p100: { type: Number, default: null },
        m100: { type: Number, default: null },
      },
      shift3: {
        p18:  { type: Number, default: null },
        p44:  { type: Number, default: null },
        p60:  { type: Number, default: null },
        p100: { type: Number, default: null },
        m100: { type: Number, default: null },
      },
    },
    lockedShifts: {
      shift1:      { type: Boolean, default: false },
      shift2:      { type: Boolean, default: false },
      shift3:      { type: Boolean, default: false },
      shift1Saved: { type: Boolean, default: false },
      shift2Saved: { type: Boolean, default: false },
      shift3Saved: { type: Boolean, default: false },
      shift3Edits: { type: Number, default: 0 },
    },
    editedFields: {
      type: Map,
      of: Boolean,
      default: {},
    },
    editAuditHistory: [
      {
        shiftKey:  { type: String, required: true },
        paramKey:  { type: String, required: true },
        oldValue:  { type: Number, default: null },
        newValue:  { type: Number, default: null },
        editedBy:  { type: String, default: 'Admin' },
        editedById:{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        timestamp: { type: Date, default: Date.now },
      }
    ],
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
      default: '',
    },
    emailStatus: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'failed', 'skipped', 'disabled'],
      default: 'pending',
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

pureSaltSieveAnalysisSchema.index({ date: 1, plant: 1, company: 1 });

const PureSaltSieveAnalysis = mongoose.model('PureSaltSieveAnalysis', pureSaltSieveAnalysisSchema);

module.exports = PureSaltSieveAnalysis;
