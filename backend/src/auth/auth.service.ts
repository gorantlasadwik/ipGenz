import { Injectable, HttpException, HttpStatus, UnauthorizedException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../utils/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private mailService: MailService
  ) {}

  async validateUser(email: string, pass: string, ipAddress?: string, force?: boolean): Promise<any> {
    // Check if it's a 15-digit trial login
    if (email.length === 15 && /^\d+$/.test(email)) {
      const trialUser = await this.usersService.findByTrialUsername(email);
      if (trialUser && trialUser.trialPassword === pass) {
        // Strict 1 IP enforcement
        if (trialUser.assignedIp) {
          if (ipAddress && trialUser.assignedIp !== ipAddress) {
            if (force) {
              // Force logout: update to new IP
              await this.usersService.updateAssignedIp(trialUser.id, ipAddress);
            } else {
              throw new HttpException(
                {
                  statusCode: 409,
                  requiresConfirmation: true,
                  message: 'This account is already logged in on another device or IP. Do you want to log out the other device and sign in here?',
                },
                HttpStatus.CONFLICT,
              );
            }
          }
        } else if (ipAddress) {
          // Lock to this IP
          await this.usersService.updateAssignedIp(trialUser.id, ipAddress);
        }

        const { passwordHash, trialPassword, ...result } = trialUser;
        return result;
      }
      return null;
    }

    const user = await this.usersService.findOne(email);
    if (user && user.passwordHash && await bcrypt.compare(pass, user.passwordHash)) {
      const { passwordHash, trialPassword, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const sessionToken = user.isPremiumTrial ? crypto.randomUUID() : undefined;
    if (sessionToken) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { currentStreamSession: sessionToken }
      });
    }

    const payload = {
      email: user.email,
      sub: user.id,
      ...(sessionToken ? { sessionToken } : {})
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        isDemo: user.email === 'demo@ipgenz.com',
        isPremiumTrial: user.isPremiumTrial || false,
        trialExpiry: user.trialExpiry || null
      }
    };
  }

  async register(email: string, pass: string) {
    const existingUser = await this.usersService.findOne(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }
    
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(pass, salt);

    const newUser = await this.usersService.create({
      email,
      passwordHash,
    });

    const { passwordHash: _, ...result } = newUser;
    return result;
  }

  async requestTrial(email: string) {
    // 1. Check if user already has an active trial or requested
    const existingTrialUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: email },
          { email: { startsWith: `${email}_trial_` } },
          { email: { startsWith: `${email}_premium_` } }
        ]
      }
    });

    if (existingTrialUser && (existingTrialUser.trialRequested || existingTrialUser.isPremiumTrial)) {
      throw new ConflictException('Trial already requested or active for this email');
    }

    // 2. Fetch the Master Trial Provider
    const masterProvider = await this.prisma.trialProvider.findFirst();
    if (!masterProvider) {
      throw new ServiceUnavailableException('Premium trials are currently disabled or not configured by the administrator.');
    }

    // 3. Generate credentials
    const trialUsername = Math.floor(100000000000000 + Math.random() * 900000000000000).toString();
    const trialPassword = Math.floor(100000000000000 + Math.random() * 900000000000000).toString();
    const trialExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 4. Send email FIRST — if this fails, NO database records are created
    //    The user can safely retry without hitting "trial already requested"
    await this.mailService.sendTrialCredentials(email, trialUsername, trialPassword);

    // 5. Email sent successfully — now create DB records
    //    Always create a new user for trials to guarantee data isolation
    const created = await this.prisma.user.create({
      data: {
        email: `${email}_trial_${trialUsername}`,
        isPremiumTrial: true,
        trialRequested: true,
        trialUsername,
        trialPassword,
        trialExpiry,
      }
    });
    const userId = created.id;

    // 6. Create default profile for the trial user
    await this.prisma.profile.create({
      data: {
        userId,
        name: 'Trial User',
      }
    });

    // 7. Create cloned provider for the trial user
    await this.prisma.provider.create({
      data: {
        userId,
        providerName: 'Premium Trial',
        providerType: masterProvider.providerType,
        serverUrl: masterProvider.serverUrl,
        username: masterProvider.username,
        encryptedPassword: masterProvider.encryptedPassword,
        playlistUrl: masterProvider.playlistUrl,
        status: 'ACTIVE'
      }
    });

    return { success: true };
  }
}
