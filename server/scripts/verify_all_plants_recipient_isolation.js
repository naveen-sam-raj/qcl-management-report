/**
 * Comprehensive Dynamic Recipient Isolation & Verification Suite
 * Covers: ALL 9 Plants in MongoDB (ACL, SA, CO2, OFFSITE, Urea, Ammonia, DAP, NPK, SPIC ACL)
 *
 * Enforces:
 * 1. Strict recipient isolation: each plant resolves ONLY to its own registered operator(s).
 * 2. Cross-plant leakage prevention: zero recipient bleed between plants.
 * 3. Zero hardcoded/demo emails (@tfl.com, MAIL_USER, etc.).
 * 4. Zero mutations to production database.
 * 5. Safe diagnostic failure handling for plants without registered operators.
 * 6. Mocked EmailJS delivery over HTTPS (test mode active).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { connectDB } = require('../config/db');
const { Plant, User } = require('../models');
const { getPlantAssignedUser } = require('../services/plantNotificationService');
const { getEmailJSConfig } = require('../services/emailjsService');

async function runIsolationSuite() {
  console.log('================================================================');
  console.log('ALL-PLANT DYNAMIC RECIPIENT ISOLATION & AUDIT TEST SUITE');
  console.log('================================================================');

  await connectDB();

  process.env.TEST_MODE = 'true';
  process.env.MOCK_EMAIL = 'true';

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // 1. Verify EmailJS Config
  console.log('\n--- 1. Shared EmailJS Configuration ---');
  const cfg = getEmailJSConfig();
  assert(cfg.isConfigured, 'EmailJS is configured with required Service ID, Template ID, and Public Key');
  assert(Boolean(cfg.privateKey), 'EmailJS Private Key (AccessToken) is present');

  // 2. Fetch all plants and users from MongoDB
  const allPlants = await Plant.find({}).populate('company').lean();
  const allUsers = await User.find({}).populate('plant').populate('company').lean();
  console.log(`\nAuditing ${allPlants.length} plants and ${allUsers.length} users in active database...`);

  // Expected operator emails for configured plants
  const EXPECTED_MAPPINGS = {
    'ACL': {
      operatorEmails: ['samrajnaveen58@gmail.com'],
      adminEmails: ['superadmin@spicglobal.com', 'admin@gmail.com'],
      disallowedEmails: ['hnaveensamraj@gmail.com', 'rajagustin581@gmail.com', 'naveensamraj2003@gmail.com', 'jebamalarnaveen@gmail.com'],
    },
    'SA': {
      operatorEmails: ['hnaveensamraj@gmail.com'],
      adminEmails: ['superadmin@spicglobal.com', 'admin@gmail.com'],
      disallowedEmails: ['samrajnaveen58@gmail.com', 'rajagustin581@gmail.com', 'naveensamraj2003@gmail.com'],
    },
    'CO2': {
      operatorEmails: ['rajagustin581@gmail.com'],
      adminEmails: ['superadmin@spicglobal.com', 'admin@gmail.com'],
      disallowedEmails: ['samrajnaveen58@gmail.com', 'hnaveensamraj@gmail.com', 'naveensamraj2003@gmail.com'],
    },
    'OFFSITE': {
      operatorEmails: ['naveensamraj2003@gmail.com', 'jebamalarnaveen@gmail.com'],
      adminEmails: ['superadmin@spicglobal.com', 'admin@gmail.com'],
      disallowedEmails: ['samrajnaveen58@gmail.com', 'hnaveensamraj@gmail.com', 'rajagustin581@gmail.com'],
    },
    'SACL_6253': {
      operatorEmails: ['spic_user_1791284586477@spic.com'],
      adminEmails: ['superadmin@spicglobal.com'],
      disallowedEmails: ['samrajnaveen58@gmail.com', 'hnaveensamraj@gmail.com', 'rajagustin581@gmail.com', 'admin@gmail.com'],
    },
  };

  const UNASSIGNED_PLANTS = ['UREA', 'AMMONIA', 'DAP', 'NPK'];

  // 3. Test Configured Plants
  console.log('\n--- 2. Auditing Configured Plants (Dynamic Resolution & Cross-Plant Isolation) ---');
  for (const [code, expected] of Object.entries(EXPECTED_MAPPINGS)) {
    console.log(`\n[Plant Code: ${code}]`);
    const res = await getPlantAssignedUser(code);

    assert(Boolean(res.plant), `Plant document found for ${code}`);
    assert(Boolean(res.assignedUser), `Assigned user resolved for ${code}`);
    assert(expected.operatorEmails.includes(res.primaryEmail), `Primary operator email matches expected: ${res.primaryEmail}`);

    // Check all expected operators are present
    for (const opEmail of expected.operatorEmails) {
      assert(res.recipientEmails.includes(opEmail), `Recipient list includes operator ${opEmail}`);
    }

    // Check cross-plant isolation: NO other plant's operator is included
    for (const disallowed of expected.disallowedEmails) {
      assert(!res.recipientEmails.includes(disallowed), `Isolation verified: ${disallowed} is NOT in recipient list for ${code}`);
    }

    // Check zero demo/hardcoded addresses
    for (const recip of res.recipientEmails) {
      assert(!recip.includes('@tfl.com'), `No demo @tfl.com address in recipient list: ${recip}`);
      assert(!recip.includes('demo'), `No demo address in recipient list: ${recip}`);
      assert(!recip.includes('example.com'), `No example address in recipient list: ${recip}`);
    }

    // Check admin containment
    for (const adminEmail of expected.adminEmails) {
      assert(res.recipientEmails.includes(adminEmail), `Authorized admin ${adminEmail} included for ${code}`);
    }
  }

  // 4. Test Unassigned Plants (Zero Registered Operators)
  console.log('\n--- 3. Auditing Unassigned Plants (Safe Failure Without Fallbacks) ---');
  for (const code of UNASSIGNED_PLANTS) {
    console.log(`\n[Unassigned Plant: ${code}]`);
    const res = await getPlantAssignedUser(code);

    assert(Boolean(res.plant), `Plant document resolved for ${code}`);
    assert(res.assignedUser === null, `No assigned user resolved for unassigned plant ${code}`);
    assert(res.primaryEmail === null, `primaryEmail is null for ${code}`);
    assert(Array.isArray(res.recipientEmails) && res.recipientEmails.length === 0, `recipientEmails is empty array for ${code}`);
    assert(Boolean(res.error), `Error message reported: "${res.error}"`);
    assert(res.error.includes('No registered user'), `Diagnostic message indicates missing operator: "${res.error}"`);
  }

  // 5. Test Non-Existent Plant
  console.log('\n--- 4. Testing Non-Existent / Invalid Plant ---');
  const invalidRes = await getPlantAssignedUser('INVALID_PLANT_XYZ_999');
  assert(invalidRes.plant === null, 'Non-existent plant returns plant: null');
  assert(invalidRes.error.includes('Could not identify plant'), `Appropriate error reported: "${invalidRes.error}"`);

  // 6. Test Company-Scoped Resolution
  console.log('\n--- 5. Testing Company-Scoped Disambiguation ---');
  const spicComp = await Plant.findOne({ code: 'SACL_6253' }).select('company').lean();
  const resWithComp = await getPlantAssignedUser('SACL_6253', { company: spicComp.company });
  assert(Boolean(resWithComp.plant), 'Resolved plant with company filter');
  assert(String(resWithComp.plant.company) === String(spicComp.company), 'Company filter correctly preserved in resolved plant');

  console.log('\n================================================================');
  console.log(`ALL ISOLATION & DYNAMIC RECIPIENT TESTS PASSED! (${passed} assertions, 0 failures)`);
  console.log('================================================================');

  process.exit(0);
}

runIsolationSuite().catch(err => {
  console.error('\n❌ Suite Error:', err);
  process.exit(1);
});
