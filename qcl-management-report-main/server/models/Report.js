const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    reportType: {
      type: String,
      enum: ['Production', 'Efficiency', 'Emissions & Carbon', 'Maintenance & Safety', 'Energy Consumption'],
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    plant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plant',
      default: null,
    },
    plantName: {
      type: String,
      default: 'All Plants',
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    generatedByName: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    period: {
      type: String,
      default: 'Daily',
    },
    status: {
      type: String,
      enum: ['Completed', 'Pending', 'Archived'],
      default: 'Completed',
    },
    metrics: {
      totalOutputTons: { type: Number, default: 0 },
      efficiencyPercentage: { type: Number, default: 0 },
      downtimeMinutes: { type: Number, default: 0 },
      powerMWh: { type: Number, default: 0 },
      co2CaptureTons: { type: Number, default: 0 },
      incidentsReported: { type: Number, default: 0 },
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
