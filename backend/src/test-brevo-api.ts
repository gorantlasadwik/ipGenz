import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testBrevoApi() {
  console.log('--- BREVO API TEST ---');
  console.log('BREVO_API_KEY:', process.env.BREVO_API_KEY ? process.env.BREVO_API_KEY.slice(0, 20) + '...' : 'NOT SET');
  console.log('SMTP_FROM_EMAIL:', process.env.SMTP_FROM_EMAIL);

  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { name: 'IPGENZ Premium', email: process.env.SMTP_FROM_EMAIL || 'ipgenz.genz@gmail.com' },
        to: [{ email: 'sadwik.us@gmail.com' }],
        subject: 'IPGENZ Brevo API Test ✅',
        htmlContent: '<p>If you are reading this, the Brevo API is working correctly from Render!</p>',
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY!,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
    );
    console.log('✅ Email sent! Status:', response.status, response.statusText);
    console.log('Message ID:', response.data?.messageId);
  } catch (error: any) {
    console.error('❌ Failed:', error.response?.data || error.message);
  }
}

testBrevoApi();
