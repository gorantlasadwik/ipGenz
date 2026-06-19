import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    let host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
    if (host.startsWith('"') && host.endsWith('"')) host = host.slice(1, -1);
    if (host.startsWith("'") && host.endsWith("'")) host = host.slice(1, -1);

    let user = (process.env.SMTP_USER || '').trim();
    if (user.startsWith('"') && user.endsWith('"')) user = user.slice(1, -1);
    if (user.startsWith("'") && user.endsWith("'")) user = user.slice(1, -1);

    let pass = (process.env.SMTP_PASS || '').trim();
    if (pass.startsWith('"') && pass.endsWith('"')) pass = pass.slice(1, -1);
    if (pass.startsWith("'") && pass.endsWith("'")) pass = pass.slice(1, -1);

    const portStr = (process.env.SMTP_PORT || '587').trim();
    const port = parseInt(portStr.replace(/['"]/g, ''), 10);

    const secureStr = (process.env.SMTP_SECURE || 'false').trim().toLowerCase().replace(/['"]/g, '');
    const secure = secureStr === 'true';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,   // 10 seconds
      socketTimeout: 10000,     // 10 seconds
    });

    this.transporter.verify((error, success) => {
      if (error) {
        this.logger.error('SMTP Connection Verification Failed on Startup:', error);
      } else {
        this.logger.log('SMTP Server connection verified successfully.');
      }
    });
  }

  async sendTrialCredentials(toEmail: string, trialUsername: string, trialPassword: string) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      this.logger.warn(`SMTP not configured. Skipping email to ${toEmail}. Credentials: ${trialUsername} / ${trialPassword}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || '"IPGENZ Premium" <noreply@ipgenz.com>',
        to: toEmail,
        subject: 'Your 1-Day Premium IPTV Trial',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #050505; color: #ffffff; padding: 40px; border-radius: 16px;">
            <h1 style="color: #ffffff; margin-bottom: 24px;">Your Premium Trial is Ready!</h1>
            <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6;">
              Thank you for requesting a 1-day premium trial with IPGENZ. Your temporary credentials have been generated and will expire in exactly 24 hours.
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
              <a href="https://ipgenz.vercel.app/login" style="background-color: #e50914; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; display: inline-block;">Login Now</a>
            </div>
          </div>
        `,
      });
      this.logger.log(`Sent trial credentials email to ${toEmail}`);
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${toEmail}:`, error);
      throw new InternalServerErrorException(`Email delivery failed: ${error.message}`);
    }
  }
}
