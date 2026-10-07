const mongoose = require('mongoose');

const plantSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Plant name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
      default: 'Factory',
    },
    status: {
      type: String,
      enum: ['operational', 'maintenance', 'alert', 'offline'],
      default: 'operational',
    },
    capacity: {
      type: String,
      default: '1000 TPD',
    },
    dailyProduction: {
      type: Number,
      default: 950,
    },
    efficiency: {
      type: Number,
      default: 96.5,
    },
    powerConsumption: {
      type: String,
      default: '42 MW',
    },
    safetyIncidents: {
      type: Number,
      default: 0,
    },
    operatorInCharge: {
      type: String,
      default: 'Chief Plant Engineer',
    },
    parameters: {
      temperature: { type: Number, default: 245 },
      pressure: { type: Number, default: 42.5 },
      flowRate: { type: Number, default: 850 },
      co2CaptureRate: { type: Number, default: 98.2 },
      purityLevel: { type: Number, default: 99.8 },
      uptimeHours: { type: Number, default: 720 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Plant', plantSchema);
