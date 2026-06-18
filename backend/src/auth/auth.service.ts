import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

  async validateUser(email: string, pass: string, ipAddress?: string): Promise<any> {
    // Check if it's a 15-digit trial login
    if (email.length === 15 && /^\d+$/.test(email)) {
      const trialUser = await this.usersService.findByTrialUsername(email);
      if (trialUser && trialUser.trialPassword === pass) {
        // Check Expiry
        if (trialUser.trialExpiry && new Date() > trialUser.trialExpiry) {
          throw new UnauthorizedException('Trial has expired. Please purchase a subscription to continue.');
        }

        // Strict 1 IP enforcement
        if (trialUser.assignedIp) {
          if (ipAddress && trialUser.assignedIp !== ipAddress) {
            throw new UnauthorizedException('This account is locked to a different IP address.');
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
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        isDemo: user.email === 'demo@ipgenz.com',
        isPremiumTrial: user.isPremiumTrial || false
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
    let existingUser = await this.usersService.findOne(email);
    if (existingUser) {
      if (existingUser.trialRequested || existingUser.isPremiumTrial) {
        throw new ConflictException('Trial already requested or active for this email');
      }
      // Update existing user
      await this.usersService.update(existingUser.id, { trialRequested: true });
      return { success: true };
    }

    // Create new user with no password hash
    await this.usersService.create({
      email,
      trialRequested: true,
    });
    return { success: true };
  }
}
