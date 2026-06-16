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

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOne(email);
    if (user && await bcrypt.compare(pass, user.passwordHash)) {
      const { passwordHash, ...result } = user;
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
        isDemo: user.email === 'demo@ipgenz.com'
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
}
