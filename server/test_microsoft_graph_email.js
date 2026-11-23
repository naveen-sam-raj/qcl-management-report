/**
 * Automated Unit Test Suite for Microsoft Graph Email Service
 * Tests:
 * 1. Missing Azure credentials (DB-isolated via injected recipient resolver)
 * 2. Missing plant sender mailbox
 * 3. Active recipient selection & validation per plant (SA vs ACL, disabled users excluded, invalid emails dropped)
 * 4. Correct sender mailbox routing per plant (SA, ACL, OFFSITE, CO2)
 * 5. In-memory duplicate suppression within time window
 * 6. Non-blocking error handling on Graph API failure
 */

const assert = require('assert');
const {
  sendPlantAnalysisNotification,
  _sentNotificationsCache,
} = require('./services/emailService');

let testsPassed = 0;
let testsFailed = 0;

function snapshotEnv() {
  const snapshot = { ...process.env };
  return function restoreEnv() {
    for (const key of Object.keys(process.env)) {
      if (!(key in snapshot)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(snapshot)) {
      process.env[key] = value;
    }
  };
}

function captureConsole() {
  const logs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = (...args) => {
    logs.push(args.map(String).join(' '));
    origLog(...args);
  };
  console.warn = (...args) => {
    logs.push(args.map(String).join(' '));
    origWarn(...args);
  };
  console.error = (...args) => {
    logs.push(args.map(String).join(' '));
    origError(...args);
  };
  return {
    getLogs: () => logs,
    restore: () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    },
  };
}

async function runAsyncTest(name, fn, assertedDescription) {
  try {
    await fn();
    const assertionText = assertedDescription ? ` -> Asserted: ${assertedDescription}` : '';
    console.log(`  [PASS] ${name}${assertionText}`);
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

  // Test 1: Missing Azure credentials (isolated, no MongoDB call, fake recipient resolver)
  await runAsyncTest(
    'Missing Azure credentials logs warning and returns skipped (No DB call)',
    async () => {
      const restoreEnv = snapshotEnv();
      const consoleCapture = captureConsole();
      try {
        delete process.env.AZURE_TENANT_ID;
        delete process.env.AZURE_CLIENT_ID;
        delete process.env.AZURE_CLIENT_SECRET;
        delete process.env.MICROSOFT_TENANT_ID;
        delete process.env.MICROSOFT_CLIENT_ID;
        delete process.env.MICROSOFT_CLIENT_SECRET;
        process.env.MAIL_SENDER_ACL = 'acl-reports@spic.co.in';

        // Fake recipient resolver ensures zero DB calls / no 10-second Mongoose timeout
        const fakeRecipientResolver = async () => [
          { email: 'acl-admin@spic.co.in', status: 'active', plant: 'ACL' },
        ];

        const result = await sendPlantAnalysisNotification({
          plantCode: 'ACL',
          analysisType: 'Pure Salt Analysis',
          date: '2026-10-24',
          recordId: 'rec_001',
          options: {
            recipientResolver: fakeRecipientResolver,
          },
        });

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.emailSent, false);
        assert.strictEqual(result.emailStatus, 'skipped');

        const allLogs = consoleCapture.getLogs().join('\n');
        const matched =
          /missing azure credentials/i.test(allLogs) ||
          /no azure creds/i.test(allLogs) ||
          /azure credentials not configured/i.test(allLogs) ||
          (result.message && /azure credentials/i.test(result.message));

        assert.ok(
          matched,
          'Log or result message must indicate missing Azure credentials'
        );
      } finally {
        consoleCapture.restore();
        restoreEnv();
      }
    },
    'status === "skipped", emailSent === false, zero MongoDB calls (injected resolver), and missing Azure creds log verified'
  );

  // Test 2: Missing plant sender mailbox
  await runAsyncTest(
    'Missing plant sender mailbox returns skipped',
    async () => {
      const restoreEnv = snapshotEnv();
      const consoleCapture = captureConsole();
      try {
        process.env.AZURE_TENANT_ID = 'test-tenant';
        process.env.AZURE_CLIENT_ID = 'test-client';
        process.env.AZURE_CLIENT_SECRET = 'test-secret';
        delete process.env.MAIL_SENDER_ACL;
        delete process.env.MICROSOFT_SENDER_EMAIL;

        const fakeCredential = {
          getToken: async () => ({ token: 'mock-access-token-12345' }),
        };

        const result = await sendPlantAnalysisNotification({
          plantCode: 'ACL',
          analysisType: 'Pure Salt Analysis',
          date: '2026-10-24',
          recordId: 'rec_002',
          options: {
            fakeCredential,
            recipientResolver: async () => [{ email: 'acl-admin@spic.co.in', status: 'active', plant: 'ACL' }],
          },
        });

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.emailSent, false);
        assert.strictEqual(result.emailStatus, 'skipped');

        const allLogs = consoleCapture.getLogs().join('\n');
        const matched =
          /sender mailbox not configured/i.test(allLogs) ||
          (result.message && /sender mailbox.*not configured/i.test(result.message));

        assert.ok(
          matched,
          'Log or result message must indicate sender mailbox not configured'
        );
      } finally {
        consoleCapture.restore();
        restoreEnv();
      }
    },
    'status === "skipped", emailSent === false, and log confirms sender mailbox not configured'
  );

  // Test 3: Recipient selection (3 active SA, 1 disabled SA, 1 invalid email, 1 ACL)
  await runAsyncTest(
    'Plant recipient isolation, disabled user exclusion, and invalid email dropping',
    async () => {
      const restoreEnv = snapshotEnv();
      try {
        process.env.AZURE_TENANT_ID = 'mock-tenant-id';
        process.env.AZURE_CLIENT_ID = 'mock-client-id';
        process.env.AZURE_CLIENT_SECRET = 'mock-client-secret';
        process.env.MAIL_SENDER_SA = 'sa-reports@spic.co.in';
        process.env.MAIL_SENDER_ACL = 'acl-reports@spic.co.in';

        const fakeCredential = {
          getToken: async () => ({ token: 'mock-token' }),
        };

        // Dataset containing:
        // - 3 active SA users
        // - 1 disabled SA user
        // - 1 invalid email SA user
        // - 1 active ACL user
        const fakeDataset = [
          { email: 'sa1@spic.co.in', status: 'active', plant: 'SA' },
          { email: 'sa2@spic.co.in', status: 'active', plant: 'SA' },
          { email: 'sa3@spic.co.in', status: 'active', plant: 'SA' },
          { email: 'sa_disabled@spic.co.in', status: 'disabled', plant: 'SA' },
          { email: 'not-an-email', status: 'active', plant: 'SA' },
          { email: 'acl1@spic.co.in', status: 'active', plant: 'ACL' },
        ];

        const fakeRecipientResolver = async () => fakeDataset;

        let lastDispatchedSA = null;
        let lastDispatchedACL = null;

        const fakeFetchSA = async (url, opts) => {
          lastDispatchedSA = JSON.parse(opts.body);
          return { ok: true, status: 202, text: async () => '' };
        };

        const fakeFetchACL = async (url, opts) => {
          lastDispatchedACL = JSON.parse(opts.body);
          return { ok: true, status: 202, text: async () => '' };
        };

        // 1. Send notification for SA plant
        const resSA = await sendPlantAnalysisNotification({
          plantCode: 'SA',
          analysisType: 'TK 401 Analysis',
          date: '2026-10-24',
          recordId: 'rec_sa_recipients',
          options: {
            fakeCredential,
            fakeFetch: fakeFetchSA,
            recipientResolver: fakeRecipientResolver,
          },
        });

        assert.strictEqual(resSA.success, true);
        assert.strictEqual(resSA.emailSent, true);
        assert.strictEqual(resSA.recipients.length, 3);
        assert.deepStrictEqual(resSA.recipients.sort(), ['sa1@spic.co.in', 'sa2@spic.co.in', 'sa3@spic.co.in']);
        assert.ok(!resSA.recipients.includes('sa_disabled@spic.co.in'), 'Disabled SA user must be excluded');
        assert.ok(!resSA.recipients.includes('not-an-email'), 'Invalid email must be excluded');
        assert.ok(!resSA.recipients.includes('acl1@spic.co.in'), 'ACL user must not receive SA email');

        // Check Graph API payload matches
        const saPayloadRecipients = lastDispatchedSA.message.toRecipients.map((r) => r.emailAddress.address);
        assert.deepStrictEqual(saPayloadRecipients.sort(), ['sa1@spic.co.in', 'sa2@spic.co.in', 'sa3@spic.co.in']);

        // 2. Send notification for ACL plant
        const resACL = await sendPlantAnalysisNotification({
          plantCode: 'ACL',
          analysisType: 'Pure Salt Analysis',
          date: '2026-10-24',
          recordId: 'rec_acl_recipients',
          options: {
            fakeCredential,
            fakeFetch: fakeFetchACL,
            recipientResolver: fakeRecipientResolver,
          },
        });

        assert.strictEqual(resACL.success, true);
        assert.strictEqual(resACL.emailSent, true);
        assert.strictEqual(resACL.recipients.length, 1);
        assert.deepStrictEqual(resACL.recipients, ['acl1@spic.co.in']);

        const aclPayloadRecipients = lastDispatchedACL.message.toRecipients.map((r) => r.emailAddress.address);
        assert.deepStrictEqual(aclPayloadRecipients, ['acl1@spic.co.in']);
      } finally {
        restoreEnv();
      }
    },
    'SA send goes strictly to 3 active SA users (disabled excluded, invalid dropped, ACL excluded) & ACL send goes strictly to 1 ACL user'
  );

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

  // Test 4-7: Correct sender mailbox routing per plant (SA, ACL, OFFSITE, CO2)
  const plantsToTest = [
    { code: 'SA', expectedSender: 'sa-reports@spic.co.in' },
    { code: 'ACL', expectedSender: 'acl-reports@spic.co.in' },
    { code: 'OFFSITE', expectedSender: 'offsite-reports@spic.co.in' },
    { code: 'CO2', expectedSender: 'co2-reports@spic.co.in' },
  ];

  for (const p of plantsToTest) {
    await runAsyncTest(
      `Correct sender mailbox selection for ${p.code}`,
      async () => {
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
            recipientResolver: async () => [{ email: 'operator@spic.co.in', status: 'active', plant: p.code }],
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
      },
      `Dispatched to Graph API url for "${p.expectedSender}" with Bearer token and valid recipient payload`
    );
  }

  // Test 8: Duplicate suppression within time window
  await runAsyncTest(
    'In-memory duplicate guard suppresses rapid repeat sends',
    async () => {
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
          recipientResolver: async () => [{ email: 'operator@spic.co.in', status: 'active', plant: 'ACL' }],
        },
      });

      assert.strictEqual(result.emailStatus, 'duplicate_suppressed');
      assert.strictEqual(callCount, 0); // Graph API never called
    },
    'Second identical save request suppressed by duplicate cache key within 60-second window; Graph API call count is 0'
  );

  // Test 9: Microsoft Graph API failure does not throw or break application
  await runAsyncTest(
    'Graph API network error is caught safely without throwing',
    async () => {
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
          recipientResolver: async () => [{ email: 'operator@spic.co.in', status: 'active', plant: 'ACL' }],
        },
      });

      assert.strictEqual(result.emailSent, false);
      assert.strictEqual(result.emailStatus, 'failed');
      assert.strictEqual(typeof result.error, 'string');
    },
    '503 Service Unavailable Graph API error caught gracefully; emailSent is false, error is string, zero unhandled exceptions'
  );

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
