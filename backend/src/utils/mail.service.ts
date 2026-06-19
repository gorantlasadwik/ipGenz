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
    const senderName  = 'IPGENZ Premium';

    try {
      await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender: { name: senderName, email: senderEmail },
          to: [{ email: toEmail }],
          subject: 'Your 1-Day Premium IPTV Trial',
          htmlContent: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #050505; color: #ffffff; padding: 40px; border-radius: 16px;">
              <h1 style="color: #ffffff; margin-bottom: 24px;">Your Premium Trial is Ready!</h1>
              <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6;">
                Thank you for requesting a 1-day premium trial with IPGENZ. Your temporary credentials have been generated
                and will expire in exactly 24 hours.
              </p>
              <div style="background-color: #111111; padding: 24px; border-radius: 12px; margin: 32px 0; border: 1px solid #333;">
                <p style="margin: 0 0 8px 0; color: #a1a1aa; font-size: 12px; text-transform: uppercase;">Username</p>
                <p style="margin: 0 0 24px 0; font-size: 24px; font-weight: bold; font-family: monospace;">${trialUsername}</p>
                <p style="margin: 0 0 8px 0; color: #a1a1aa; font-size: 12px; text-transform: uppercase;">Password</p>
                <p style="margin: 0; font-size: 24px; font-weight: bold; font-family: monospace;">${trialPassword}</p>
              </div>
              <p style="color: #a1a1aa; font-size: 14px;">
                <strong>Note:</strong> These credentials are locked to the first IP address that logs in. Do not share them with anyone else.
              </p>
              <div style="margin-top: 40px; text-align: center;">
                <a href="https://ipgenz.vercel.app/login"
                   style="background-color: #e50914; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Login Now
                </a>
              </div>
            </div>
          `,
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
