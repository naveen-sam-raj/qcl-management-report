require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { connectDB } = require('./config/db');

// Route imports
const authRoutes = require('./routes/authRoutes');
const companyRoutes = require('./routes/companyRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const plantRoutes = require('./routes/plantRoutes');
const reportRoutes = require('./routes/reportRoutes');
const logRoutes = require('./routes/logRoutes');
const pureSaltAnalysisRoutes = require('./routes/pureSaltAnalysisRoutes');
const brineAnalysisRoutes = require('./routes/brineAnalysisRoutes');
const pureSaltSieveAnalysisRoutes = require('./routes/pureSaltSieveAnalysisRoutes');
const tk203AnalysisRoutes = require('./routes/tk203AnalysisRoutes');
const tk205AnalysisRoutes = require('./routes/tk205AnalysisRoutes');
const tk207AnalysisRoutes = require('./routes/tk207AnalysisRoutes');
const aclProductRoutes = require('./routes/aclProductRoutes');
const pclTclAnalysisRoutes = require('./routes/pclTclAnalysisRoutes');
const cr203AnalysisRoutes = require('./routes/cr203AnalysisRoutes');
const cr202AnalysisRoutes = require('./routes/cr202AnalysisRoutes');
const t401AnalysisRoutes = require('./routes/t401AnalysisRoutes');
const tk419AnalysisRoutes = require('./routes/tk419AnalysisRoutes');
const lsa500AnalysisRoutes = require('./routes/lsa500AnalysisRoutes');
const lsaAnalysisRoutes = require('./routes/lsaAnalysisRoutes');
const lsaBaggingSieveRoutes = require('./routes/lsaBaggingSieveRoutes');
const cbdAnalysisRoutes = require('./routes/cbdAnalysisRoutes');
const flyAshAnalysisRoutes = require('./routes/flyAshAnalysisRoutes');
const bottomAshAnalysisRoutes = require('./routes/bottomAshAnalysisRoutes');
const rawWaterAnalysisRoutes = require('./routes/rawWaterAnalysisRoutes');
const bfwAnalysisRoutes = require('./routes/bfwAnalysisRoutes');
const sewerWaterAnalysisRoutes = require('./routes/sewerWaterAnalysisRoutes');
const coolingWaterAnalysisRoutes = require('./routes/coolingWaterAnalysisRoutes');
const distillerWasteAnalysisRoutes = require('./routes/distillerWasteAnalysisRoutes');
const vacuumSealWaterRoutes = require('./routes/vacuumSealWaterRoutes');
const bicarbonateAnalysisRoutes = require('./routes/bicarbonateAnalysisRoutes');
const bicarbonateMoistureRoutes = require('./routes/bicarbonateMoistureRoutes');
const e501T501Routes = require('./routes/e501T501Routes');
const dmWaterAnalysisRoutes = require('./routes/dmWaterAnalysisRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const { initializeDefaultSuperAdmin } = require('./controllers/superAdminController');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Normalize /api/api requests so both client calling conventions work
app.use((req, res, next) => {
  if (req.url.startsWith('/api/api/')) {
    req.url = req.url.replace('/api/api/', '/api/');
  }
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/plants', plantRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/pure-salt-analysis', pureSaltAnalysisRoutes);
app.use('/api/brine-analysis', brineAnalysisRoutes);
app.use('/api/pure-salt-sieve-analysis', pureSaltSieveAnalysisRoutes);
app.use('/api/tk-203-analysis', tk203AnalysisRoutes);
app.use('/api/tk-205-analysis', tk205AnalysisRoutes);
app.use('/api/tk-207-analysis', tk207AnalysisRoutes);
app.use('/api/acl-product', aclProductRoutes);
app.use('/api/pcl-tcl-analysis', pclTclAnalysisRoutes);
app.use('/api/cr-203-analysis', cr203AnalysisRoutes);
app.use('/api/cr-202-analysis', cr202AnalysisRoutes);
app.use('/api/t-401-analysis', t401AnalysisRoutes);
app.use('/api/tk-419-analysis', tk419AnalysisRoutes);
app.use('/api/lsa-500-analysis', lsa500AnalysisRoutes);
app.use('/api/lsa-analysis', lsaAnalysisRoutes);
app.use('/api/lsa-shift-analysis', lsaAnalysisRoutes);
app.use('/api/lsa-bagging-sieve', lsaBaggingSieveRoutes);
app.use('/api/cbd-analysis', cbdAnalysisRoutes);
app.use('/api/fly-ash-analysis', flyAshAnalysisRoutes);
app.use('/api/bottom-ash-analysis', bottomAshAnalysisRoutes);
app.use('/api/raw-water-analysis', rawWaterAnalysisRoutes);
app.use('/api/bfw-analysis', bfwAnalysisRoutes);
app.use('/api/sewer-water-analysis', sewerWaterAnalysisRoutes);
app.use('/api/sewar-water-analysis', sewerWaterAnalysisRoutes);
app.use('/api/cooling-water-analysis', coolingWaterAnalysisRoutes);
app.use('/api/distiller-waste-analysis', distillerWasteAnalysisRoutes);
app.use('/api/vacuum-seal-water', vacuumSealWaterRoutes);
app.use('/api/vaccum-seal-water', vacuumSealWaterRoutes);
app.use('/api/bicarbonate-analysis', bicarbonateAnalysisRoutes);
app.use('/api/bi-carbonate-analysis', bicarbonateAnalysisRoutes);
app.use('/api/bicarbonate-moisture', bicarbonateMoistureRoutes);
app.use('/api/bi-carbonate-moisture', bicarbonateMoistureRoutes);
app.use('/api/e501-t501-analysis', e501T501Routes);
app.use('/api/e501-analysis', e501T501Routes);
app.use('/api/t501-analysis', e501T501Routes);
app.use('/api/dm-water-analysis', dmWaterAnalysisRoutes);
app.use('/api/dm-water', dmWaterAnalysisRoutes);
app.use('/api/super-admin', superAdminRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'SPIC-TFL-Greenstar Analytics API is operational',
    timestamp: new Date(),
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API Route Not Found: ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Global Error]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SPIC-TFL-Greenstar API running on port ${PORT}`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`====================================================`);
});

module.exports = app;
