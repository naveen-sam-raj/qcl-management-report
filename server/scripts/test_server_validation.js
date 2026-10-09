// No mock-req-res
// We need to test the router manually, or start an express app.
// Since we don't have supertest easily available, we can require the router and mock the express app.
const express = require('express');
const request = require('supertest');
const path = require('path');

// Mock auth middleware BEFORE requiring router
const authPath = require.resolve('../middleware/auth');
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: {
    protect: (req, res, next) => {
      req.user = {
        _id: '6ac62b10e42bcc5cd168892a',
        role: 'user',
        authorizedShifts: ['I SHIFT'],
        company: '6ac62b10e42bcc5cd168892a'
      };
      next();
    }
  }
};

const router = require('../routes/acl300Routes');

const PlantAnalysisRecord = require('../models/PlantAnalysisRecord');
PlantAnalysisRecord.findOneAndUpdate = async () => ({ _id: "mock_id", shift: "I SHIFT" });

const app = express();
app.use(express.json());
app.use('/api/acl-300-analysis', router);

const runTests = async () => {
  console.log(`Starting Server-Side Boundary Validation Tests...`);
  let passed = 0;
  let failed = 0;

  const assert = (condition, msg) => {
    if (condition) {
      console.log(` ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(` ❌ FAIL: ${msg}`);
      failed++;
    }
  };

  const testCases = [
    {
      name: "Valid exactly at minimum/maximum limits",
      payload: { date: "2026-10-10", shifts: { shift1: { nacl: "1.90", p18: "6.0", p44: "55.0" } } },
      expectStatus: 201
    },
    {
      name: "Below minimum limit (nacl: 1.89)",
      payload: { date: "2026-10-10", shifts: { shift1: { nacl: "1.89" } } },
      expectStatus: 400,
      expectError: "Allowed: 1.9"
    },
    {
      name: "Above maximum limit (p18: 6.01)",
      payload: { date: "2026-10-10", shifts: { shift1: { p18: "6.01" } } },
      expectStatus: 400,
      expectError: "Allowed: 4 - 6"
    },
    {
      name: "Non-numeric string value",
      payload: { date: "2026-10-10", shifts: { shift1: { p44: "abc" } } },
      expectStatus: 400,
      expectError: "must be a valid finite number"
    },
    {
      name: "NaN value",
      payload: { date: "2026-10-10", shifts: { shift1: { nacl: "NaN" } } },
      expectStatus: 400,
      expectError: "must be a valid finite number"
    },
    {
      name: "Infinity value",
      payload: { date: "2026-10-10", shifts: { shift1: { p18: "Infinity" } } },
      expectStatus: 400,
      expectError: "must be a valid finite number"
    },
    {
      name: "Unauthorized shift (Shift II)",
      payload: { date: "2026-10-10", shifts: { shift2: { nacl: "2.0" } } },
      expectStatus: 403,
      expectError: "Forbidden: You are not authorized"
    },
    {
      name: "Empty strings allowed (skipped)",
      payload: { date: "2026-10-10", shifts: { shift1: { nacl: "" } } },
      expectStatus: 201
    }
  ];

// Move this mock up

  for (const tc of testCases) {
     const res = await request(app).post('/api/acl-300-analysis').send(tc.payload);
     
     // Note: if status is 500, it means the DB mock didn't work right, but we care about 400/403.
     if (res.status === tc.expectStatus) {
         if (tc.expectError) {
             const errorStr = JSON.stringify(res.body);
             if (errorStr.includes(tc.expectError)) {
                 assert(true, tc.name);
             } else {
                 assert(false, `${tc.name} - Expected error containing "${tc.expectError}" but got: ${errorStr}`);
             }
         } else {
             assert(true, tc.name);
         }
     } else {
         assert(false, `${tc.name} - Expected Status ${tc.expectStatus}, got ${res.status} (Body: ${JSON.stringify(res.body)})`);
     }
  }

  console.log(`\n--- Test Summary ---`);
  console.log(`Passed: ${passed} | Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
};

runTests();
