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
}
