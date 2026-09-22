const { Company, Plant, User, Report, ActivityLog } = require('../models');

const seedDatabase = async () => {
  try {
    const existingCompanies = await Company.countDocuments();
    if (existingCompanies > 0) {
      console.log('[Seed] Database already initialized.');
      return;
    }

    console.log('[Seed] Initializing clean enterprise platform (SPIC, TFL, Greenstar)...');

    // 1. Create Companies (SPIC, TFL, Greenstar)
    const spic = await Company.create({
      name: 'SPIC',
      code: 'SPIC',
      status: 'active',
      description: 'Southern Petrochemical Industries Corporation - Premier fertilizer manufacturer.',
      industry: 'Agri-Nutrients & Fertilizers',
      established: '1969',
      tagline: 'Empowering Agriculture with Quality Nutrients',
      hasAnalytics: false,
      primaryColor: '#059669',
    });

    const tfl = await Company.create({
      name: 'TFL',
      code: 'TFL',
      status: 'active',
      description: 'Tuticorin Alkali Chemicals and Fertilizers Limited - Pioneer in dual soda ash synthesis.',
      industry: 'Chemical & Industrial Minerals',
      established: '1971',
      tagline: 'Pioneering Clean Chemical Innovations',
      hasAnalytics: true,
      primaryColor: '#2563EB',
    });

    const greenstar = await Company.create({
      name: 'Greenstar (GSFL)',
      code: 'GSFL',
      status: 'active',
      description: 'Greenstar Fertilizers Limited - Leading phosphatic fertilizer producer.',
      industry: 'Complex Phosphatic Fertilizers',
      established: '2012',
      tagline: 'Sustainable Plant Nutrition Solutions',
      hasAnalytics: false,
      primaryColor: '#0D9488',
    });

    // 2. Create the 4 Plant Units for TFL (ready for users to be assigned to them)
    await Plant.create({
      company: tfl._id,
      name: 'ACL Plant',
      code: 'ACL',
      description: 'Ammonium Chloride Manufacturing Facility with continuous crystallizer loops.',
      icon: 'Factory',
      status: 'operational',
      capacity: '800 TPD',
      dailyProduction: 785,
      efficiency: 98.1,
      powerConsumption: '38 MW',
      safetyIncidents: 0,
      operatorInCharge: 'Pending Assignment',
      parameters: {
        temperature: 185,
        pressure: 38.2,
        flowRate: 780,
        co2CaptureRate: 97.4,
        purityLevel: 99.7,
        uptimeHours: 720,
      },
    });

    await Plant.create({
      company: tfl._id,
      name: 'SA Plant',
      code: 'SA',
      description: 'Soda Ash Production Facility leveraging modified Solvay carbonation towers.',
      icon: 'Flame',
      status: 'operational',
      capacity: '1,200 TPD',
      dailyProduction: 1160,
      efficiency: 96.8,
      powerConsumption: '54 MW',
      safetyIncidents: 0,
      operatorInCharge: 'Pending Assignment',
      parameters: {
        temperature: 240,
        pressure: 45.1,
        flowRate: 1150,
        co2CaptureRate: 98.9,
        purityLevel: 99.5,
        uptimeHours: 718,
      },
    });

    await Plant.create({
      company: tfl._id,
      name: 'OFFSITE Plant',
      code: 'OFFSITE',
      description: 'Offsite Utilities, Water Demineralization, Effluent Treatment & Steam Generation.',
      icon: 'Globe',
      status: 'operational',
      capacity: '4,500 m³/hr',
      dailyProduction: 4320,
      efficiency: 99.2,
      powerConsumption: '22 MW',
      safetyIncidents: 0,
      operatorInCharge: 'Pending Assignment',
      parameters: {
        temperature: 95,
        pressure: 28.0,
        flowRate: 4300,
        co2CaptureRate: 96.0,
        purityLevel: 99.9,
        uptimeHours: 720,
      },
    });

    await Plant.create({
      company: tfl._id,
      name: 'CO2 Plant',
      code: 'CO2',
      description: 'Carbon Capture & Utilization (CCU) Plant recycling industrial boiler flue gases.',
      icon: 'Gauge',
      status: 'operational',
      capacity: '600 TPD',
      dailyProduction: 590,
      efficiency: 98.4,
      powerConsumption: '18 MW',
      safetyIncidents: 0,
      operatorInCharge: 'Pending Assignment',
      parameters: {
        temperature: 42,
        pressure: 18.5,
        flowRate: 590,
        co2CaptureRate: 99.2,
        purityLevel: 99.95,
        uptimeHours: 715,
      },
    });

    // 3. ONLY Super Admin is created (all other admins and users are created by the user!)
    await User.create({
      name: 'Super Admin',
      email: 'superadmin@spicglobal.com',
      username: 'superadmin',
      password: 'Admin@123',
      mobile: '+91 98400 11001',
      role: 'super_admin',
      status: 'active',
    });

    // 4. Clean Initial System Log
    await ActivityLog.create({
      userName: 'Super Admin',
      userEmail: 'superadmin@spicglobal.com',
      role: 'super_admin',
      companyName: 'Corporate HQ',
      action: 'SYSTEM_INITIALIZATION',
      details: 'Clean system initialized. Ready for Super Admin to create company admins and users.',
      status: 'SUCCESS',
    });

    console.log('[Seed] Clean system successfully initialized with Super Admin only.');
  } catch (err) {
    console.error('[Seed] Error initializing system:', err);
  }
};

module.exports = { seedDatabase };
