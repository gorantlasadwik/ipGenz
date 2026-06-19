import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendTrialCredentials(toEmail: string, trialUsername: string, trialPassword: string) {
    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
      this.logger.warn(
        `BREVO_API_KEY not configured. Skipping email to ${toEmail}. ` +
        `Credentials: ${trialUsername} / ${trialPassword}`,
      );
      return;
    }

    const senderEmail = process.env.SMTP_FROM_EMAIL || 'ipgenz.genz@gmail.com';
    const senderName  = 'IPGENZ';

    // Plain-text version (important for spam score — emails with only HTML are flagged)
    const textContent = `
Welcome to IPGENZ!

Your temporary access credentials are below. They expire in 24 hours.

Username: ${trialUsername}
Password: ${trialPassword}

Visit https://ipgenz.vercel.app/login to sign in.

These credentials are tied to the first device that logs in — keep them private.

— The IPGENZ Team
    `.trim();

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your IPGENZ Access</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#0a0a0a;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #1a1a1a;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">IPGENZ</p>
              <p style="margin:4px 0 0;font-size:13px;color:#71717a;">Streaming · Delivered</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h1 style="margin:0 0 12px;font-size:24px;color:#ffffff;font-weight:700;">
                Your Access Credentials
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                Welcome! Your 24-hour access has been provisioned. Use the credentials
                below to sign in. They will expire in exactly <strong style="color:#ffffff;">24 hours</strong>.
              </p>

              <!-- Credentials box -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#141414;border:1px solid #262626;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#52525b;text-transform:uppercase;letter-spacing:1px;">
                      Username
                    </p>
                    <p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#ffffff;font-family:monospace,monospace;letter-spacing:1px;">
                      ${trialUsername}
                    </p>
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#52525b;text-transform:uppercase;letter-spacing:1px;">
                      Password
                    </p>
                    <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;font-family:monospace,monospace;letter-spacing:1px;">
                      ${trialPassword}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#e50914;border-radius:8px;">
                    <a href="https://ipgenz.vercel.app/login"
                       style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
                      Sign In Now →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#52525b;line-height:1.6;">
                These credentials are locked to the first device that uses them.
                Do not share them with others.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #1a1a1a;">
              <p style="margin:0;font-size:12px;color:#3f3f46;line-height:1.6;">
                You received this email because someone requested a trial using this address on
                <a href="https://ipgenz.vercel.app" style="color:#52525b;">ipgenz.vercel.app</a>.
                If this was not you, please ignore this message.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender: { name: senderName, email: senderEmail },
          to: [{ email: toEmail }],
          subject: 'Your IPGENZ access credentials',
          textContent,
          htmlContent,
        },
        {
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      );

      this.logger.log(`Sent trial credentials email to ${toEmail}`);
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || 'Unknown error';
      this.logger.error(`Failed to send email to ${toEmail}: ${msg}`);
      throw new InternalServerErrorException(`Email delivery failed: ${msg}`);
    }
  }

  async sendPaymentAlert(request: {
    id: string;
    userEmail: string;
    userName: string;
    plan: string;
    amount: number;
    upiRef?: string | null;
    createdAt: Date;
  }) {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) return;

    const senderEmail = process.env.SMTP_FROM_EMAIL || 'ipgenz.genz@gmail.com';

    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { name: 'IPGENZ Payments', email: senderEmail },
        to: [{ email: 'sadwik.india@gmail.com' }],
        subject: `💰 New Payment Request — ${request.plan} (₹${request.amount})`,
        textContent: `New payment request received!\n\nName: ${request.userName}\nEmail: ${request.userEmail}\nPlan: ${request.plan}\nAmount: ₹${request.amount}\nUPI Ref: ${request.upiRef || 'Not provided'}\nTime: ${request.createdAt}\n\nReview at: https://ipgenz.vercel.app/sadwik/payments`,
        htmlContent: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;padding:32px;border-radius:12px;">
            <h2 style="color:#22c55e;margin:0 0 20px;">💰 New Payment Request</h2>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="color:#a1a1aa;padding:6px 0;font-size:13px;">Name</td><td style="font-weight:700;padding:6px 0;">${request.userName}</td></tr>
              <tr><td style="color:#a1a1aa;padding:6px 0;font-size:13px;">Email</td><td style="font-weight:700;padding:6px 0;">${request.userEmail}</td></tr>
              <tr><td style="color:#a1a1aa;padding:6px 0;font-size:13px;">Plan</td><td style="font-weight:700;padding:6px 0;">${request.plan}</td></tr>
              <tr><td style="color:#a1a1aa;padding:6px 0;font-size:13px;">Amount</td><td style="font-weight:700;padding:6px 0;color:#22c55e;">₹${request.amount}</td></tr>
              <tr><td style="color:#a1a1aa;padding:6px 0;font-size:13px;">UPI Ref</td><td style="font-weight:700;padding:6px 0;">${request.upiRef || 'Not provided'}</td></tr>
            </table>
            <div style="margin-top:28px;text-align:center;">
              <a href="https://ipgenz.vercel.app/sadwik/payments" style="background:#e50914;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block;">
                Review in Admin Panel →
              </a>
            </div>
          </div>`,
      },
      { headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' } },
    ).catch((e: any) => {
      this.logger.error('Failed to send payment alert:', e.response?.data?.message || e.message);
    });
  }

  async sendPaymentApprovalReceipt(
    toEmail: string,
    userName: string,
    planName: string,
    amount: number,
    transactionId: string,
    loginUsername: string,
    loginPassword: string,
  ) {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      this.logger.warn(`BREVO_API_KEY not configured. Skipping payment approval receipt to ${toEmail}.`);
      return;
    }

    const senderEmail = process.env.SMTP_FROM_EMAIL || 'ipgenz.genz@gmail.com';
    const senderName = 'IPGENZ Payments';

    const textContent = `
Hi ${userName},

Your manual payment has been verified and your subscription to IPGENZ is now active!

Plan: ${planName}
Amount Paid: ₹${amount}
Invoice Reference: INV-${transactionId.slice(0, 8).toUpperCase()}

Account Credentials:
Username: ${loginUsername}
Password: ${loginPassword}

Login here: https://ipgenz.vercel.app/login

Thank you for choosing IPGENZ!
    `.trim();

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Approved & Invoice</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#0a0a0a;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #1a1a1a;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">IPGENZ</p>
              <p style="margin:4px 0 0;font-size:13px;color:#71717a;">Streaming · Premium Access Active</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h1 style="margin:0 0 12px;font-size:24px;color:#22c55e;font-weight:700;">
                Payment Approved!
              </h1>
              <p style="margin:0 0 28px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                Hi <strong>${userName}</strong>, your manual payment has been verified. Your subscription to the <strong style="color:#ffffff;">${planName}</strong> plan is now active. Use the credentials below to sign in and enjoy premium IPTV streaming.
              </p>

              <!-- Credentials box -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#141414;border:1px solid #262626;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#52525b;text-transform:uppercase;letter-spacing:1px;">
                      Username
                    </p>
                    <p style="margin:0 0 20px;font-size:16px;font-weight:700;color:#ffffff;font-family:monospace;">
                      ${loginUsername}
                    </p>
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#52525b;text-transform:uppercase;letter-spacing:1px;">
                      Password
                    </p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;font-family:monospace;">
                      ${loginPassword}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:36px;">
                <tr>
                  <td style="background:#e50914;border-radius:8px;">
                    <a href="https://ipgenz.vercel.app/login"
                       style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
                      Sign In Now →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Invoice Details -->
              <div style="border-top:1px solid #1a1a1a;padding-top:28px;">
                <h2 style="margin:0 0 16px;font-size:18px;color:#ffffff;font-weight:700;">
                  Billing Invoice
                </h2>
                
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;font-size:13px;color:#a1a1aa;line-height:1.6;">
                  <tr>
                    <td style="padding-bottom:8px;"><strong>Invoice Number:</strong></td>
                    <td align="right" style="color:#ffffff;padding-bottom:8px;font-family:monospace;">INV-${transactionId.slice(0, 8).toUpperCase()}</td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:8px;"><strong>Date:</strong></td>
                    <td align="right" style="color:#ffffff;padding-bottom:8px;">${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}</td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:8px;"><strong>Payment Method:</strong></td>
                    <td align="right" style="color:#ffffff;padding-bottom:8px;">UPI (Manual Verification)</td>
                  </tr>
                </table>

                <!-- Invoice Items Table -->
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border-radius:8px;font-size:13px;color:#ffffff;border:1px solid #262626;">
                  <thead>
                    <tr style="border-bottom:1px solid #262626;">
                      <th align="left" style="padding:12px 16px;color:#71717a;font-weight:600;font-size:11px;text-transform:uppercase;">Description</th>
                      <th align="right" style="padding:12px 16px;color:#71717a;font-weight:600;font-size:11px;text-transform:uppercase;">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style="padding:16px;color:#ffffff;">IPGENZ Premium - ${planName} Plan</td>
                      <td align="right" style="padding:16px;color:#22c55e;font-weight:700;">₹${amount}.00</td>
                    </tr>
                    <tr style="border-top:1px solid #262626;background:#1a1a1a;">
                      <td style="padding:16px;font-weight:700;color:#ffffff;">Total Paid</td>
                      <td align="right" style="padding:16px;color:#22c55e;font-weight:700;font-size:15px;">₹${amount}.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #1a1a1a;">
              <p style="margin:0;font-size:12px;color:#3f3f46;line-height:1.6;">
                For support or billing inquiries, reply directly to this email or reach us at <a href="mailto:sadwik.india@gmail.com" style="color:#52525b;">sadwik.india@gmail.com</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender: { name: senderName, email: senderEmail },
          to: [{ email: toEmail }],
          subject: `✨ Your IPGENZ Access is Ready — Invoice #INV-${transactionId.slice(0, 8).toUpperCase()}`,
          textContent,
          htmlContent,
        },
        {
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      );
      this.logger.log(`Sent payment approval and billing email to ${toEmail}`);
    } catch (e: any) {
      this.logger.error(`Failed to send payment approval email to ${toEmail}:`, e.response?.data?.message || e.message);
    }
  }
}
