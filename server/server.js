const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
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
const acl300Routes = require('./routes/acl300Routes');
const rawSaltRoutes = require('./routes/rawSaltRoutes');
const pclTclAnalysisRoutes = require('./routes/pclTclAnalysisRoutes');
const cr203AnalysisRoutes = require('./routes/cr203AnalysisRoutes');
const cr202AnalysisRoutes = require('./routes/cr202AnalysisRoutes');
const t401AnalysisRoutes = require('./routes/t401AnalysisRoutes');
const tk419AnalysisRoutes = require('./routes/tk419AnalysisRoutes');
const lsa500AnalysisRoutes = require('./routes/lsa500AnalysisRoutes');
const lsaAnalysisRoutes = require('./routes/lsaAnalysisRoutes');
const lsaBaggingSieveRoutes = require('./routes/lsaBaggingSieveRoutes');
const lsaBaggingRoutes = require('./routes/lsaBaggingRoutes');
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
const tk204Tk209Routes = require('./routes/tk204Tk209Routes');
const tk204AnalysisRoutes = require('./routes/tk204AnalysisRoutes');
const tk209AnalysisRoutes = require('./routes/tk209AnalysisRoutes');
const bl1204AnalysisRoutes = require('./routes/bl1204AnalysisRoutes');
const absorberInletAnalysisRoutes = require('./routes/absorberInletAnalysisRoutes');
const outletAnalysisRoutes = require('./routes/outletAnalysisRoutes');
const leanAnalysisRoutes = require('./routes/leanAnalysisRoutes');
const richAnalysisRoutes = require('./routes/richAnalysisRoutes');
const washwaterAnalysisRoutes = require('./routes/washwaterAnalysisRoutes');
const p1256AnalysisRoutes = require('./routes/p1256AnalysisRoutes');
const refluxAnalysisRoutes = require('./routes/refluxAnalysisRoutes');
const tk1251AnalysisRoutes = require('./routes/tk1251AnalysisRoutes');
const tk1252AnalysisRoutes = require('./routes/tk1252AnalysisRoutes');
const dccDrainLiqAnalysisRoutes = require('./routes/dccDrainLiqAnalysisRoutes');
const soxDrainLiqAnalysisRoutes = require('./routes/soxDrainLiqAnalysisRoutes');
const absorberDrainLiqAnalysisRoutes = require('./routes/absorberDrainLiqAnalysisRoutes');
const leanWeeklyAnalysisRoutes = require('./routes/leanWeeklyAnalysisRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const saTk401AnalysisRoutes = require('./routes/saTk401AnalysisRoutes');
const saTk405AnalysisRoutes = require('./routes/saTk405AnalysisRoutes');
const saTk414TscAnalysisRoutes = require('./routes/saTk414TscAnalysisRoutes');
const saP413WscAnalysisRoutes = require('./routes/saP413WscAnalysisRoutes');
const saTk419ScAnalysisRoutes = require('./routes/saTk419ScAnalysisRoutes');
const saP4171AnalysisRoutes = require('./routes/saP4171AnalysisRoutes');
const saP4172AnalysisRoutes = require('./routes/saP4172AnalysisRoutes');
const saP4173AnalysisRoutes = require('./routes/saP4173AnalysisRoutes');
const gasConcRoutes = require('./routes/gasConcRoutes');
const cacl2AnalysisRoutes = require('./routes/cacl2AnalysisRoutes');
const tflRoutes = require('./routes/tflRoutes');
const { initializeDefaultSuperAdmin } = require('./controllers/superAdminController');
const autoPlantEmailMiddleware = require('./middleware/autoPlantEmailMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB();

// CORS Middleware setup (supports Vercel deployment, local dev, and custom client URL)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:3000',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, cURL, Postman)
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        /\.vercel\.app$/.test(origin) ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);
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

// Auto-notify assigned plant user on any plant data save/update
app.use('/api', autoPlantEmailMiddleware);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/plants', plantRoutes);
app.use('/api/tfl', tflRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/pure-salt-analysis', pureSaltAnalysisRoutes);
app.use('/api/brine-analysis', brineAnalysisRoutes);
app.use('/api/pure-salt-sieve-analysis', pureSaltSieveAnalysisRoutes);
app.use('/api/tk-203-analysis', tk203AnalysisRoutes);
app.use('/api/tk-204-analysis', tk204AnalysisRoutes);
app.use('/api/tk204-analysis', tk204AnalysisRoutes);
app.use('/api/tk-209-analysis', tk209AnalysisRoutes);
app.use('/api/tk209-analysis', tk209AnalysisRoutes);
app.use('/api/tk-204-tk-209-analysis', tk204Tk209Routes);
app.use('/api/tk204-tk209-analysis', tk204Tk209Routes);
app.use('/api/tk204-209-analysis', tk204Tk209Routes);
app.use('/api/tk-205-analysis', tk205AnalysisRoutes);
app.use('/api/tk-207-analysis', tk207AnalysisRoutes);
app.use('/api/acl-product', aclProductRoutes);
app.use('/api/acl-300-analysis', acl300Routes);
app.use('/api/acl-300', acl300Routes);
app.use('/api/raw-salt-analysis', rawSaltRoutes);
app.use('/api/raw-salt', rawSaltRoutes);
app.use('/api/pcl-tcl-analysis', pclTclAnalysisRoutes);
app.use('/api/cr-203-analysis', cr203AnalysisRoutes);
app.use('/api/cr-202-analysis', cr202AnalysisRoutes);
app.use('/api/cacl2-analysis', cacl2AnalysisRoutes);
app.use('/api/cacl2', cacl2AnalysisRoutes);
app.use('/api/t-401-analysis', t401AnalysisRoutes);
app.use('/api/t401-analysis', t401AnalysisRoutes);
app.use('/api/tk-419-analysis', tk419AnalysisRoutes);
app.use('/api/lsa-500-analysis', lsa500AnalysisRoutes);
app.use('/api/lsa-analysis', lsaAnalysisRoutes);
app.use('/api/lsa-shift-analysis', lsaAnalysisRoutes);
app.use('/api/lsa-bagging-sieve', lsaBaggingSieveRoutes);
app.use('/api/lsa-bagging-analysis', lsaBaggingRoutes);
app.use('/api/lsa-bagging', lsaBaggingRoutes);
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
app.use('/api/gas-conc', gasConcRoutes);
app.use('/api/gas-concentration', gasConcRoutes);
app.use('/api/dm-water-analysis', dmWaterAnalysisRoutes);
app.use('/api/dm-water', dmWaterAnalysisRoutes);
app.use('/api/bl1204-analysis', bl1204AnalysisRoutes);
app.use('/api/bl1204-bl1203-analysis', bl1204AnalysisRoutes);
app.use('/api/bl1204', bl1204AnalysisRoutes);
app.use('/api/absorber-inlet-analysis', absorberInletAnalysisRoutes);
app.use('/api/absorber-inlet', absorberInletAnalysisRoutes);
app.use('/api/outlet-analysis', outletAnalysisRoutes);
app.use('/api/outlet', outletAnalysisRoutes);
app.use('/api/lean-analysis', leanAnalysisRoutes);
app.use('/api/lean', leanAnalysisRoutes);
app.use('/api/rich-analysis', richAnalysisRoutes);
app.use('/api/rich', richAnalysisRoutes);
app.use('/api/washwater-analysis', washwaterAnalysisRoutes);
app.use('/api/washwater', washwaterAnalysisRoutes);
app.use('/api/p1256-analysis', p1256AnalysisRoutes);
app.use('/api/p1256', p1256AnalysisRoutes);
app.use('/api/reflux-analysis', refluxAnalysisRoutes);
app.use('/api/reflux', refluxAnalysisRoutes);
app.use('/api/tk1251-analysis', tk1251AnalysisRoutes);
app.use('/api/tk1251', tk1251AnalysisRoutes);
app.use('/api/tk1252-analysis', tk1252AnalysisRoutes);
app.use('/api/tk1252', tk1252AnalysisRoutes);
app.use('/api/dcc-drain-liq-analysis', dccDrainLiqAnalysisRoutes);
app.use('/api/dcc-drain-liq', dccDrainLiqAnalysisRoutes);
app.use('/api/sox-drain-liq-analysis', soxDrainLiqAnalysisRoutes);
app.use('/api/sox-drain-liq', soxDrainLiqAnalysisRoutes);
app.use('/api/absorber-drain-liq-analysis', absorberDrainLiqAnalysisRoutes);
app.use('/api/absorber-drain-liq', absorberDrainLiqAnalysisRoutes);
app.use('/api/lean-weekly-analysis', leanWeeklyAnalysisRoutes);
app.use('/api/lean-weekly', leanWeeklyAnalysisRoutes);
app.use('/api/sa-tk-401-analysis', saTk401AnalysisRoutes);
app.use('/api/sa-tk-405-analysis', saTk405AnalysisRoutes);
app.use('/api/sa-tk-414-tsc-analysis', saTk414TscAnalysisRoutes);
app.use('/api/sa-p413-wsc-analysis', saP413WscAnalysisRoutes);
app.use('/api/sa-tk-419-sc-analysis', saTk419ScAnalysisRoutes);
app.use('/api/sa-p417-1-analysis', saP4171AnalysisRoutes);
app.use('/api/sa-p417-analysis', saP4171AnalysisRoutes);
app.use('/api/sa-p417-2-analysis', saP4172AnalysisRoutes);
app.use('/api/sa-p417-3-analysis', saP4173AnalysisRoutes);
app.use('/api/super-admin', superAdminRoutes);

// Root Health Check Route (Render / Service Liveness)
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SPIC-TFL-Greenstar API is running',
    status: 'healthy',
  });
});

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

const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SPIC-TFL-Greenstar API running on port ${PORT}`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`====================================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${PORT} is already in use by another running process.`);
    console.error(`👉 Either stop the existing process running on port ${PORT}, or change PORT in server/.env.\n`);
    process.exit(1);
  } else {
    console.error('[Server Error]', err);
  }
});

module.exports = app;
