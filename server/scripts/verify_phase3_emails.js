require('dotenv').config({ path: '../.env' });
const { sendAnalysisNotification, createNodemailerTransporter } = require('../services/emailService');
const nodemailer = require('nodemailer');

const runTests = async () => {
  console.log(`Starting Phase 3 Email Template & Routing Verification...`);
  let passed = 0;
  let failed = 0;

  // Mock nodemailer to intercept emails
  const sentEmails = [];
  nodemailer.createTransport = () => ({
    sendMail: async (opts) => {
      sentEmails.push(opts);
      if (opts.to === 'fail@example.com') {
         throw new Error("Simulated Provider Failure");
      }
      return { messageId: `mock-msg-${Date.now()}` };
    }
  });

  const assert = (condition, msg) => {
    if (condition) {
      console.log(` ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(` ❌ FAIL: ${msg}`);
      failed++;
    }
  };

  const records = [
    {
       _id: "record-1-daily",
       plantCode: "ACL",
       analysisType: "ACL 300# Analysis",
       date: "2026-10-10",
       shift: "I SHIFT",
       time: "",
       submittedBy: "John Doe",
       data: { p18: "12", p44: "3", nacl: "98.5" }
    },
    {
       _id: "record-2-timed",
       plantCode: "TFL",
       analysisType: "Brine",
       date: "2026-10-10",
       shift: "II SHIFT",
       time: "14:30",
       submittedBy: "<script>alert('xss')</script>", // Testing XSS
       data: { ca: "1.2", mg: "4.5" }
    },
    {
       _id: "record-3-empty",
       plantCode: "ACL",
       analysisType: "Empty Analysis",
       date: "2026-10-10",
       shift: "III SHIFT",
       time: "",
       submittedBy: "Jane Doe",
       data: {} // Empty submission
    }
  ];

  // 1. Test Daily Record (time: "")
  process.env.ADMIN_EMAIL = 'admin@example.com';
  await sendAnalysisNotification(records[0]);
  const mail1 = sentEmails.pop();
  assert(mail1.subject.includes('ACL - ACL 300# Analysis Saved (2026-10-10)'), 'Correct Subject Formatting');
  assert(!mail1.html.includes('Sample Time'), 'Daily record handles time="" correctly (no time field rendered)');
  assert(mail1.html.includes('P18') && mail1.html.includes('12'), 'Parameter P18 rendered correctly');

  // 2. Test Timed Record with XSS attempt
  await sendAnalysisNotification(records[1]);
  const mail2 = sentEmails.pop();
  assert(mail2.html.includes('Sample Time') && mail2.html.includes('14:30'), 'Timed record includes Sample Time row');
  assert(!mail2.html.includes('<script>'), 'XSS payload successfully escaped (<script> tag not found)');
  assert(mail2.html.includes('&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;'), 'XSS payload successfully escaped to HTML entities');

  // 3. Test Empty Submission
  await sendAnalysisNotification(records[2]);
  const mail3 = sentEmails.pop();
  assert(mail3.html.includes('No readings provided.'), 'Empty readings handled gracefully');

  // 4. Test Invalid Submission (should fail early)
  const resInvalid = await sendAnalysisNotification({ date: "2026-10-10" });
  assert(resInvalid.success === false && resInvalid.error.includes('Invalid record'), 'Returns error on missing fields');

  // 5. Test Email Provider Failure
  process.env.ADMIN_EMAIL = 'fail@example.com';
  try {
     await sendAnalysisNotification(records[0]);
     assert(false, 'Provider failure was not handled properly');
  } catch (e) {
     assert(e.message.includes('failed to send'), 'Provider failure throws correct exception to trigger retry DB state');
  }

  console.log(`\n--- Verification Complete ---`);
  console.log(`Passed: ${passed} | Failed: ${failed}`);
  
  if (failed > 0) process.exit(1);
};

runTests();
