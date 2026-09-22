/**
 * mockData.js
 * All demo/mock data for the SPIC Group Analytics Dashboard.
 * No backend required — everything runs from this file.
 */

// ─── MOCK USERS ───────────────────────────────────────────────────────────────
// Each user has: id, name, email, username, password, role, company, status, lastLogin
export const MOCK_USERS = [
  // Super Admin
  {
    _id: 'user_superadmin_001',
    name: 'Super Administrator',
    email: 'superadmin@spicgroup.com',
    username: 'superadmin',
    password: 'Admin@123',
    role: 'super_admin',
    company: null,
    plant: null,
    status: 'active',
    lastLogin: '2026-09-22T08:00:00Z',
    mobile: '+91 9876543210',
  },

  // SPIC Company Admin
  {
    _id: 'user_spic_admin_001',
    name: 'Rajan Krishnamurthy',
    email: 'admin@spic.in',
    username: 'spic.admin',
    password: 'Spic@123',
    role: 'company_admin',
    company: { _id: 'company_spic', name: 'SPIC', code: 'SPIC', fullName: 'Southern Petrochemical Industries Corporation Ltd.' },
    plant: null,
    status: 'active',
    lastLogin: '2026-09-21T10:30:00Z',
    mobile: '+91 9444001122',
  },

  // TFL Company Admin
  {
    _id: 'user_tfl_admin_001',
    name: 'Anand Subramanian',
    email: 'admin@tfl.in',
    username: 'tfl.admin',
    password: 'Tfl@1234',
    role: 'company_admin',
    company: { _id: 'company_tfl', name: 'TFL', code: 'TFL', fullName: 'Tuticorin Alkali Chemicals and Fertilizers Ltd.' },
    plant: null,
    status: 'active',
    lastLogin: '2026-09-22T07:15:00Z',
    mobile: '+91 9443229900',
  },

  // Greenstar Company Admin
  {
    _id: 'user_gsfl_admin_001',
    name: 'Priya Venkatesh',
    email: 'admin@gsfl.in',
    username: 'gsfl.admin',
    password: 'Gsfl@123',
    role: 'company_admin',
    company: { _id: 'company_gsfl', name: 'Greenstar', code: 'GSFL', fullName: 'Greenstar Fertilizers Limited (GSFL)' },
    plant: null,
    status: 'active',
    lastLogin: '2026-09-20T14:00:00Z',
    mobile: '+91 9442885577',
  },

  // TFL Normal Users (One operator per plant)
  {
    _id: 'user_tfl_op_001',
    name: 'Murugan Selvam',
    email: 'murugan@tfl.in',
    username: 'murugan.tfl',
    password: 'User@1234',
    role: 'user',
    company: { _id: 'company_tfl', name: 'TFL', code: 'TFL' },
    plant: { _id: 'plant_acl', name: 'ACL Plant', code: 'ACL' },
    status: 'active',
    lastLogin: '2026-09-22T06:00:00Z',
    mobile: '+91 9445566778',
  },
  {
    _id: 'user_tfl_op_002',
    name: 'Suresh Kumar',
    email: 'suresh@tfl.in',
    username: 'suresh.tfl',
    password: 'User@1234',
    role: 'user',
    company: { _id: 'company_tfl', name: 'TFL', code: 'TFL' },
    plant: { _id: 'plant_sa', name: 'SA Plant', code: 'SA' },
    status: 'active',
    lastLogin: '2026-09-22T06:30:00Z',
    mobile: '+91 9445566779',
  },
  {
    _id: 'user_tfl_op_003',
    name: 'Karthik Raja',
    email: 'karthik@tfl.in',
    username: 'karthik.tfl',
    password: 'User@1234',
    role: 'user',
    company: { _id: 'company_tfl', name: 'TFL', code: 'TFL' },
    plant: { _id: 'plant_offset', name: 'OFFSET Plant', code: 'OFFSET' },
    status: 'active',
    lastLogin: '2026-09-22T07:00:00Z',
    mobile: '+91 9445566780',
  },
  {
    _id: 'user_tfl_op_004',
    name: 'Praveen Raj',
    email: 'praveen@tfl.in',
    username: 'praveen.tfl',
    password: 'User@1234',
    role: 'user',
    company: { _id: 'company_tfl', name: 'TFL', code: 'TFL' },
    plant: { _id: 'plant_co2', name: 'CO2 Plant', code: 'CO2' },
    status: 'active',
    lastLogin: '2026-09-22T07:30:00Z',
    mobile: '+91 9445566781',
  },
];

// ─── MOCK COMPANIES ───────────────────────────────────────────────────────────
export const MOCK_COMPANIES = [
  {
    _id: 'company_spic',
    name: 'SPIC',
    code: 'SPIC',
    fullName: 'Southern Petrochemical Industries Corporation Ltd.',
    industry: 'Agri-Nutrients & Chemical Manufacturing',
    status: 'active',
    adminCount: 1,
    plantCount: 0,
    description: 'Premier agri-nutrients powerhouse manufacturing high-grade urea, complex fertilizers, and industrial chemicals.',
  },
  {
    _id: 'company_tfl',
    name: 'TFL',
    code: 'TFL',
    fullName: 'Tuticorin Alkali Chemicals and Fertilizers Ltd.',
    industry: 'Chemical Synthesis & Carbon Recovery',
    status: 'active',
    adminCount: 1,
    plantCount: 4,
    description: 'Pioneering synthetic soda ash and ammonium chloride manufacturer with CCU technology.',
  },
  {
    _id: 'company_gsfl',
    name: 'Greenstar',
    code: 'GSFL',
    fullName: 'Greenstar Fertilizers Limited (GSFL)',
    industry: 'Complex Phosphatic Nutrients',
    status: 'active',
    adminCount: 1,
    plantCount: 0,
    description: 'Major phosphatic fertilizer and water-soluble nutrient manufacturer.',
  },
];

// ─── MOCK PLANTS (TFL) ───────────────────────────────────────────────────────
export const MOCK_PLANTS = [
  {
    _id: 'plant_acl',
    company: { _id: 'company_tfl', name: 'TFL', code: 'TFL' },
    name: 'ACL Plant',
    code: 'ACL',
    description: 'Ammonium Chloride production unit with automated process control systems.',
    status: 'operational',
    capacity: 150,
    currentProduction: 138,
    efficiency: 92,
    icon: 'factory',
    metrics: [
      { label: 'Daily Output', value: '138 MT', trend: '+2.1%' },
      { label: 'Efficiency', value: '92%', trend: '+0.5%' },
      { label: 'Uptime', value: '99.1%', trend: 'stable' },
    ],
  },
  {
    _id: 'plant_sa',
    company: { _id: 'company_tfl', name: 'TFL', code: 'TFL' },
    name: 'SA Plant',
    code: 'SA',
    description: 'Solvay process soda ash manufacturing with carbon capture integration.',
    status: 'operational',
    capacity: 200,
    currentProduction: 187,
    efficiency: 93.5,
    icon: 'flame',
    metrics: [
      { label: 'Daily Output', value: '187 MT', trend: '+3.2%' },
      { label: 'Efficiency', value: '93.5%', trend: '+1.0%' },
      { label: 'Uptime', value: '98.7%', trend: 'stable' },
    ],
  },
  {
    _id: 'plant_offsite',
    company: { _id: 'company_tfl', name: 'TFL', code: 'TFL' },
    name: 'OFFSET Plant',
    code: 'OFFSET',
    description: 'Utility, water treatment, effluent management, and warehousing operations.',
    status: 'operational',
    capacity: 100,
    currentProduction: 91,
    efficiency: 91,
    icon: 'globe',
    metrics: [
      { label: 'Water Treatment', value: '1200 KL', trend: 'stable' },
      { label: 'Effluent Treated', value: '980 KL', trend: '-0.3%' },
      { label: 'Power Usage', value: '4.2 MW', trend: '-1.1%' },
    ],
  },
  {
    _id: 'plant_co2',
    company: { _id: 'company_tfl', name: 'TFL', code: 'TFL' },
    name: 'CO2 Plant',
    code: 'CO2',
    description: 'Carbon dioxide capture, purification, and utilization facility — CCU plant.',
    status: 'operational',
    capacity: 50,
    currentProduction: 0,
    efficiency: 0,
    icon: 'gauge',
    metrics: [
      { label: 'CO₂ Captured', value: '— MT', trend: 'maintenance' },
      { label: 'Purity Level', value: '—', trend: 'maintenance' },
      { label: 'Status', value: 'Scheduled Maintenance', trend: 'maintenance' },
    ],
  },
];

// ─── MOCK COMPANY ADMINS (for Super Admin view) ───────────────────────────────
export const MOCK_COMPANY_ADMINS = MOCK_USERS.filter((u) => u.role === 'company_admin').map((u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  username: u.username,
  mobile: u.mobile,
  status: u.status,
  lastLogin: u.lastLogin,
  company: u.company,
}));

// ─── MOCK REPORTS ────────────────────────────────────────────────────────────
export const MOCK_REPORTS = [
  {
    _id: 'report_001',
    title: 'TFL Monthly Production Summary — September 2026',
    reportType: 'Production',
    company: { _id: 'company_tfl', name: 'TFL', code: 'TFL' },
    plant: { _id: 'plant_acl', name: 'ACL Plant', code: 'ACL' },
    period: 'September 2026',
    createdAt: '2026-09-21T10:00:00Z',
    status: 'completed',
    metrics: { totalOutput: '4140 MT', efficiency: '92%', uptime: '99.1%' },
  },
  {
    _id: 'report_002',
    title: 'Soda Ash Quarterly Efficiency Report — Q3 2026',
    reportType: 'Efficiency',
    company: { _id: 'company_tfl', name: 'TFL', code: 'TFL' },
    plant: { _id: 'plant_sa', name: 'Soda Ash Plant', code: 'SA' },
    period: 'Q3 2026',
    createdAt: '2026-09-15T09:00:00Z',
    status: 'completed',
    metrics: { totalOutput: '17,110 MT', efficiency: '93.5%', uptime: '98.7%' },
  },
  {
    _id: 'report_003',
    title: 'CCU Carbon Capture Maintenance Report — September 2026',
    reportType: 'Maintenance',
    company: { _id: 'company_tfl', name: 'TFL', code: 'TFL' },
    plant: { _id: 'plant_co2', name: 'CO₂ Capture Unit', code: 'CO2' },
    period: 'September 2026',
    createdAt: '2026-09-18T12:00:00Z',
    status: 'pending',
    metrics: { status: 'Under Maintenance', estimatedCompletion: '2026-09-30' },
  },
];

// ─── MOCK ACTIVITY LOGS ───────────────────────────────────────────────────────
export const MOCK_LOGS = [
  { _id: 'log_001', action: 'LOGIN', user: 'superadmin', details: 'Super admin logged in', timestamp: '2026-09-22T08:00:00Z', severity: 'info' },
  { _id: 'log_002', action: 'CREATE_ADMIN', user: 'superadmin', details: 'Created company admin: Anand Subramanian (TFL)', timestamp: '2026-09-21T15:30:00Z', severity: 'success' },
  { _id: 'log_003', action: 'LOGIN', user: 'tfl.admin', details: 'TFL Admin logged in', timestamp: '2026-09-22T07:15:00Z', severity: 'info' },
  { _id: 'log_004', action: 'REPORT_GENERATED', user: 'tfl.admin', details: 'Generated monthly production report for ACL Plant', timestamp: '2026-09-21T10:00:00Z', severity: 'success' },
  { _id: 'log_005', action: 'USER_CREATED', user: 'tfl.admin', details: 'Created plant operator: Murugan Selvam (ACL)', timestamp: '2026-09-20T14:00:00Z', severity: 'success' },
];

// ─── MOCK STATS ───────────────────────────────────────────────────────────────
export const MOCK_STATS = {
  totalCompanies: 3,
  totalAdmins: 3,
  totalUsers: 5,
  totalPlants: 4,
  activePlants: 3,
  activeUsers: 4,
};
