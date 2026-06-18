import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testEmail() {
  console.log('--- SMTP TEST SCRIPT ---');
  console.log('SMTP_USER:', process.env.SMTP_USER);
  console.log('SMTP_HOST:', process.env.SMTP_HOST);
  console.log('SMTP_PORT:', process.env.SMTP_PORT);
  console.log('SMTP_SECURE:', process.env.SMTP_SECURE);
  
  // Clean double quotes from password if they exist
  let smtpPass = process.env.SMTP_PASS || '';
  if (smtpPass.startsWith('"') && smtpPass.endsWith('"')) {
    console.log('Warning: SMTP_PASS contains surrounding double quotes. Stripping them...');
    smtpPass = smtpPass.slice(1, -1);
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: smtpPass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  try {
    console.log('Verifying connection to SMTP server...');
    await transporter.verify();
    console.log('SMTP connection verified successfully!');

    console.log('Sending test email to sadwik.us@gmail.com...');
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"IPGENZ Premium" <noreply@ipgenz.com>',
      to: 'sadwik.us@gmail.com',
      subject: 'Test Email from SMTP Diagnostic',
      text: 'If you are reading this, the SMTP setup is 100% correct and works!',
      html: '<p>If you are reading this, the SMTP setup is 100% correct and works!</p>',
    });
    console.log('Test email sent successfully!');
  } catch (err: any) {
    console.error('SMTP test failed with error:');
    console.error(err);
  }
}

testEmail();
