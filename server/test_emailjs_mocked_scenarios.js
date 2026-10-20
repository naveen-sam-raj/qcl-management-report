/**
 * Comprehensive Mocked Test Suite for EmailJS Delivery & Fallback Scenarios
 * Strictly NO live test emails sent and NO production database records altered.
 */

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const emailjs = require('@emailjs/nodejs');
const {
  formatEmailJSError,
  sendEmailJSOffsiteNotification,
  getEmailJSConfig,
} = require('./services/emailjsService');

async function runMockedTests() {
  console.log('================================================================');
  console.log('EMAILJS DELIVERY FAILURE & HTTPS REST FALLBACK MOCKED TEST SUITE');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  const test = async (name, fn) => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Reason: ${err.message}`);
      failed++;
    }
  };

  // Helper to mock emailjs.send
  const mockEmailJSSend = (fn) => {
    Object.defineProperty(emailjs, 'send', {
      value: fn,
      configurable: true,
      writable: true,
    });
  };

  // Save original descriptor and fetch to restore later
  const originalSendDescriptor = Object.getOwnPropertyDescriptor(emailjs, 'send');
  const originalFetch = global.fetch;

  // Ensure test mode is OFF during mocked dispatch tests so we test the full try/catch pipeline
  delete process.env.TEST_MODE;
  delete process.env.MOCK_EMAIL;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  // ── 1. Unit Tests for formatEmailJSError ──
  console.log('\n--- 1. Error Formatting Unit Tests (Prevent "undefined" log) ---');

  await test('formatEmailJSError correctly handles EmailJSResponseStatus instance', () => {
    const sdkErr = new emailjs.EmailJSResponseStatus(403, 'The service_id is invalid');
    const formatted = formatEmailJSError(sdkErr);
    assert.strictEqual(formatted.status, 403);
    assert.strictEqual(formatted.message, 'The service_id is invalid');
    assert.ok(!formatted.fullString.includes('undefined'), 'Must not contain "undefined"');
    assert.ok(formatted.fullString.includes('403') && formatted.fullString.includes('The service_id is invalid'));
  });

  await test('formatEmailJSError correctly handles standard JavaScript Error', () => {
    const jsErr = new Error('getaddrinfo ENOTFOUND api.emailjs.com');
    const formatted = formatEmailJSError(jsErr);
    assert.strictEqual(formatted.message, 'getaddrinfo ENOTFOUND api.emailjs.com');
    assert.ok(!formatted.fullString.includes('undefined'), 'Must not contain "undefined"');
    assert.ok(formatted.fullString.includes('ENOTFOUND'));
  });

  await test('formatEmailJSError correctly handles raw string error thrown by SDK validation', () => {
    const strErr = 'The public key is required. Visit https://dashboard.emailjs.com/admin/account';
    const formatted = formatEmailJSError(strErr);
    assert.strictEqual(formatted.message, strErr);
    assert.ok(!formatted.fullString.includes('undefined'), 'Must not contain "undefined"');
  });

  await test('formatEmailJSError handles null and undefined safely', () => {
    const nullErr = formatEmailJSError(null);
    assert.strictEqual(nullErr.message, 'Unknown error');
    const undefErr = formatEmailJSError(undefined);
    assert.strictEqual(undefErr.message, 'Unknown error');
  });

  // ── 2. Mocked Delivery Flow Tests ──
  console.log('\n--- 2. Mocked Delivery & Fallback Scenarios ---');

  await test('Scenario A: Primary SDK succeeds on first attempt', async () => {
    mockEmailJSSend(async () => ({ status: 200, text: 'OK' }));

    const result = await sendEmailJSOffsiteNotification({
      recipientEmails: ['test.operator@spic.co.in'],
      plantName: 'OFFSITE Plant',
      analysisType: 'DM Water Analysis',
      date: '2026-10-20',
      shift: 'Day',
      htmlBody: '<p>Mocked</p>',
      textBody: 'Mocked',
      isTestMode: false,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.emailStatus, 'sent');
    assert.strictEqual(result.provider, 'EmailJS Node SDK');
    assert.ok(result.messageId.startsWith('emailjs_'));
  });

  await test('Scenario B: SDK fails with EmailJSResponseStatus (undefined message bug), HTTPS fallback succeeds', async () => {
    const capturedLogs = [];
    const origWarn = console.warn;
    console.warn = (...args) => capturedLogs.push(args.join(' '));

    mockEmailJSSend(async () => {
      throw new emailjs.EmailJSResponseStatus(403, 'API access from non-browser environments is currently disabled');
    });

    let fetchCalledWith = null;
    global.fetch = async (url, opts) => {
      fetchCalledWith = { url, opts, body: JSON.parse(opts.body) };
      return {
        ok: true,
        status: 200,
        text: async () => 'OK',
      };
    };

    const result = await sendEmailJSOffsiteNotification({
      recipientEmails: ['test.operator@spic.co.in'],
      plantName: 'OFFSITE Plant',
      analysisType: 'DM Water Analysis',
      date: '2026-10-20',
      shift: 'Day',
      htmlBody: '<p>Mocked</p>',
      textBody: 'Mocked',
      isTestMode: false,
    });

    console.warn = origWarn;

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.emailStatus, 'sent');
    assert.strictEqual(result.provider, 'EmailJS HTTPS REST API');
    assert.ok(fetchCalledWith, 'Direct HTTPS fallback fetch must have been invoked');
    assert.strictEqual(fetchCalledWith.url, 'https://api.emailjs.com/api/v1.0/email/send');
    assert.strictEqual(fetchCalledWith.opts.method, 'POST');
    assert.strictEqual(fetchCalledWith.body.user_id, process.env.EMAILJS_PUBLIC_KEY || 'MBU25mvCa4W0oFDPp');

    // Verify warning log did NOT log "undefined"
    const sdkWarning = capturedLogs.find((l) => l.includes('@emailjs/nodejs SDK error'));
    assert.ok(sdkWarning, 'Must log SDK error warning');
    assert.ok(!sdkWarning.includes('(undefined)'), `Warning log must not contain "(undefined)", got: ${sdkWarning}`);
    assert.ok(sdkWarning.includes('403'), `Warning log must contain HTTP status 403, got: ${sdkWarning}`);
    assert.ok(sdkWarning.includes('non-browser'), `Warning log must contain actual text, got: ${sdkWarning}`);
  });

  await test('Scenario C: SDK fails AND HTTPS fallback API rejects with 400 Bad Request', async () => {
    mockEmailJSSend(async () => {
      throw new emailjs.EmailJSResponseStatus(400, 'Invalid parameters');
    });

    global.fetch = async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'The recipient email is invalid',
    });

    const result = await sendEmailJSOffsiteNotification({
      recipientEmails: ['test.operator@spic.co.in'],
      plantName: 'OFFSITE Plant',
      analysisType: 'DM Water Analysis',
      date: '2026-10-20',
      shift: 'Day',
      htmlBody: '<p>Mocked</p>',
      textBody: 'Mocked',
      isTestMode: false,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.emailStatus, 'failed');
    assert.ok(result.error.includes('EmailJS HTTPS API rejected request (400)'));
    assert.ok(result.error.includes('The recipient email is invalid'));
  });

  await test('Scenario D: SDK fails AND HTTPS fallback throws network failure', async () => {
    mockEmailJSSend(async () => {
      throw new emailjs.EmailJSResponseStatus(500, 'Server Error');
    });

    global.fetch = async () => {
      throw new Error('fetch failed: connect ETIMEDOUT');
    };

    const result = await sendEmailJSOffsiteNotification({
      recipientEmails: ['test.operator@spic.co.in'],
      plantName: 'OFFSITE Plant',
      analysisType: 'DM Water Analysis',
      date: '2026-10-20',
      shift: 'Day',
      htmlBody: '<p>Mocked</p>',
      textBody: 'Mocked',
      isTestMode: false,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.emailStatus, 'failed');
    assert.ok(!result.error.includes('undefined'), 'Error message must not contain undefined');
    assert.ok(result.error.includes('ETIMEDOUT') || result.error.includes('delivery failed'));
  });

  await test('Scenario E: Missing recipient returns accurate failed status without network calls', async () => {
    let callCount = 0;
    mockEmailJSSend(async () => { callCount++; });
    global.fetch = async () => { callCount++; };

    const result = await sendEmailJSOffsiteNotification({
      recipientEmails: [],
      analysisType: 'DM Water Analysis',
      date: '2026-10-20',
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.emailStatus, 'failed');
    assert.strictEqual(callCount, 0, 'No network calls must be made when recipient is missing');
    assert.ok(result.error.includes('No valid recipient email address'));
  });

  await test('Scenario F: isTestMode flag activates mock delivery without network calls', async () => {
    let callCount = 0;
    mockEmailJSSend(async () => { callCount++; });
    global.fetch = async () => { callCount++; };

    const result = await sendEmailJSOffsiteNotification({
      recipientEmails: ['test.operator@spic.co.in'],
      plantName: 'OFFSITE Plant',
      analysisType: 'DM Water Analysis',
      date: '2026-10-20',
      isTestMode: true,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.emailStatus, 'sent');
    assert.strictEqual(result.provider, 'EmailJS (Mocked)');
    assert.strictEqual(callCount, 0, 'Must not make any network calls in test mode');
  });

  // Restore mocks and environment
  Object.defineProperty(emailjs, 'send', originalSendDescriptor);
  global.fetch = originalFetch;
  process.env.NODE_ENV = originalNodeEnv;

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMockedTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
