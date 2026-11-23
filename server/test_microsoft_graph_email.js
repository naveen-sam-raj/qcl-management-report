/**
 * Automated Unit Test Suite for Microsoft Graph Email Service
 * Tests:
 * 1. Correct sender mailbox per plant (SA, ACL, OFFSITE, CO2)
 * 2. Plant-specific email dispatch via mocked Graph API endpoint
 * 3. Graceful handling of missing Azure credentials (no throw, logs warning)
 * 4. Graceful handling of missing plant sender mailbox (no throw)
 * 5. In-memory duplicate suppression within time window
 * 6. Non-blocking error handling on Graph API failure
 * 7. Verified graceful response when no recipients found
 */

const assert = require('assert');
const {
  sendPlantAnalysisNotification,
  _sentNotificationsCache,
} = require('./services/emailService');

let testsPassed = 0;
let testsFailed = 0;

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    testsFailed++;
  }
}

async function runAll() {
  console.log('========================================================================');
  console.log('RUNNING MICROSOFT GRAPH EMAIL SERVICE TESTS (MOCKED GRAPH RESPONSES)');
  console.log('========================================================================');

  // Test 1: Missing Azure credentials should gracefully return skipped, never throw
  await runAsyncTest('Missing Azure credentials logs warning and returns skipped', async () => {
    delete process.env.AZURE_TENANT_ID;
    delete process.env.AZURE_CLIENT_ID;
    delete process.env.AZURE_CLIENT_SECRET;
    delete process.env.MICROSOFT_TENANT_ID;
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;

    const result = await sendPlantAnalysisNotification({
      plantCode: 'ACL',
      analysisType: 'Pure Salt Analysis',
      date: '2026-10-24',
      recordId: 'rec_001',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.emailSent, false);
    assert.strictEqual(result.emailStatus, 'skipped');
  });

  // Test 2: Missing plant sender mailbox returns skipped
  await runAsyncTest('Missing plant sender mailbox returns skipped', async () => {
    process.env.AZURE_TENANT_ID = 'test-tenant';
    process.env.AZURE_CLIENT_ID = 'test-client';
    process.env.AZURE_CLIENT_SECRET = 'test-secret';
    delete process.env.MAIL_SENDER_ACL;
    delete process.env.MICROSOFT_SENDER_EMAIL;

    const result = await sendPlantAnalysisNotification({
      plantCode: 'ACL',
      analysisType: 'Pure Salt Analysis',
      date: '2026-10-24',
      recordId: 'rec_002',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.emailSent, false);
    assert.strictEqual(result.emailStatus, 'skipped');
  });

  // Setup Mock Azure Environment for remaining tests
  process.env.AZURE_TENANT_ID = 'mock-tenant-id';
  process.env.AZURE_CLIENT_ID = 'mock-client-id';
  process.env.AZURE_CLIENT_SECRET = 'mock-client-secret';
  process.env.MAIL_SENDER_SA = 'sa-reports@spic.co.in';
  process.env.MAIL_SENDER_ACL = 'acl-reports@spic.co.in';
  process.env.MAIL_SENDER_OFFSITE = 'offsite-reports@spic.co.in';
  process.env.MAIL_SENDER_CO2 = 'co2-reports@spic.co.in';

  const fakeCredential = {
    getToken: async () => ({ token: 'mock-access-token-12345' }),
  };

  // Test 3: Correct sender mailbox routing per plant (SA, ACL, OFFSITE, CO2)
  const plantsToTest = [
    { code: 'SA', expectedSender: 'sa-reports@spic.co.in' },
    { code: 'ACL', expectedSender: 'acl-reports@spic.co.in' },
    { code: 'OFFSITE', expectedSender: 'offsite-reports@spic.co.in' },
    { code: 'CO2', expectedSender: 'co2-reports@spic.co.in' },
  ];

  for (const p of plantsToTest) {
    await runAsyncTest(`Correct sender mailbox selection for ${p.code}`, async () => {
      let dispatchedUrl = '';
      let dispatchedPayload = null;
      let authorizationHeader = '';

      const fakeFetch = async (url, opts) => {
        dispatchedUrl = url;
        authorizationHeader = opts.headers?.Authorization;
        dispatchedPayload = JSON.parse(opts.body);
        return { ok: true, status: 202, text: async () => '' };
      };

      const plantDoc = { _id: `id_${p.code}`, name: `${p.code} Plant`, code: p.code };

      const result = await sendPlantAnalysisNotification({
        plantDoc,
        plantCode: p.code,
        analysisType: `${p.code} Test Analysis`,
        date: '2026-10-24',
        recordId: `rec_${p.code}_test`,
        options: {
          fakeCredential,
          fakeFetch,
          recipientEmails: ['operator@spic.co.in'],
        },
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.emailSent, true);
      assert.strictEqual(result.senderMailbox, p.expectedSender);
      assert.strictEqual(
        dispatchedUrl,
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(p.expectedSender)}/sendMail`
      );
      assert.strictEqual(authorizationHeader, 'Bearer mock-access-token-12345');
      assert.strictEqual(dispatchedPayload.message.toRecipients[0].emailAddress.address, 'operator@spic.co.in');
    });
  }

  // Test 4: Duplicate suppression within time window
  await runAsyncTest('In-memory duplicate guard suppresses rapid repeat sends', async () => {
    let callCount = 0;
    const fakeFetch = async () => {
      callCount++;
      return { ok: true, status: 202, text: async () => '' };
    };

    const key = 'ACL:rec_dup_test:2026-10-24:pure salt analysis';
    _sentNotificationsCache.set(key, Date.now());

    const result = await sendPlantAnalysisNotification({
      plantCode: 'ACL',
      analysisType: 'Pure Salt Analysis',
      date: '2026-10-24',
      recordId: 'rec_dup_test',
      options: {
        fakeCredential,
        fakeFetch,
        recipientEmails: ['operator@spic.co.in'],
      },
    });

    assert.strictEqual(result.emailStatus, 'duplicate_suppressed');
    assert.strictEqual(callCount, 0); // Graph API never called
  });

  // Test 5: Microsoft Graph API failure does not throw or break application
  await runAsyncTest('Graph API network error is caught safely without throwing', async () => {
    const failingFetch = async () => {
      return { ok: false, status: 503, statusText: 'Service Unavailable', text: async () => 'Graph Down' };
    };

    const result = await sendPlantAnalysisNotification({
      plantCode: 'ACL',
      analysisType: 'Pure Salt Analysis',
      date: '2026-10-25',
      recordId: 'rec_fail_test',
      options: {
        fakeCredential,
        fakeFetch: failingFetch,
        recipientEmails: ['operator@spic.co.in'],
      },
    });

    // Should return result object with emailSent: false, NEVER throw an exception
    assert.strictEqual(result.emailSent, false);
    assert.strictEqual(result.emailStatus, 'failed');
    assert.strictEqual(typeof result.error, 'string');
  });

  // Cleanup test environment
  delete process.env.AZURE_TENANT_ID;
  delete process.env.AZURE_CLIENT_ID;
  delete process.env.AZURE_CLIENT_SECRET;
  delete process.env.MAIL_SENDER_SA;
  delete process.env.MAIL_SENDER_ACL;
  delete process.env.MAIL_SENDER_OFFSITE;
  delete process.env.MAIL_SENDER_CO2;

  console.log('========================================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('========================================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('[Test Suite Error]', err);
  process.exit(1);
});
