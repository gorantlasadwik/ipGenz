import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
dotenv.config();

async function testEmail() {
  console.log('Testing SMTP connection with:');
  console.log('Host:', process.env.SMTP_HOST);
  console.log('User:', process.env.SMTP_USER);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"IPGENZ Premium" <noreply@ipgenz.com>',
      to: 'sadwik.us@gmail.com',
      subject: 'IPGENZ Premium - Test Email',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #050505; color: #ffffff; padding: 40px; border-radius: 16px;">
          <h1 style="color: #ffffff; margin-bottom: 24px;">SMTP Test Successful!</h1>
          <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6;">
            If you are reading this, your SMTP credentials in the .env file are working perfectly! The backend can now automatically email 1-day trial credentials to users.
          </p>
          <div style="background-color: #111111; padding: 24px; border-radius: 12px; margin: 32px 0; border: 1px solid #333;">
            <p style="margin: 0 0 8px 0; color: #a1a1aa; font-size: 12px; text-transform: uppercase;">Username</p>
            <p style="margin: 0 0 24px 0; font-size: 24px; font-weight: bold; font-family: monospace;">123456789012345</p>
            
            <p style="margin: 0 0 8px 0; color: #a1a1aa; font-size: 12px; text-transform: uppercase;">Password</p>
            <p style="margin: 0; font-size: 24px; font-weight: bold; font-family: monospace;">543210987654321</p>
          </div>
        </div>
      `,
    });
    console.log('Message sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

testEmail();
