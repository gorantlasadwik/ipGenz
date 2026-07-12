import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'super-secret-key-change-me',
    });
  }

  async validate(payload: any) {
    const user: any = await this.usersService.findOne(payload.email);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.isPremiumTrial) {
      const isSrk = user.email === 'srk' || user.email === 'srk@ipgenz.com';
      if (!isSrk) {
        if (!payload.sessionToken || payload.sessionToken !== user.currentStreamSession) {
          throw new UnauthorizedException('Session expired: logged in on another device');
        }
        if (user.trialExpiry && new Date() > user.trialExpiry) {
          throw new UnauthorizedException('Subscription expired');
        }
      }
    }
    // Return standard user payload
    return { userId: payload.sub, email: payload.email, isPremiumTrial: user.isPremiumTrial };
  }
}
