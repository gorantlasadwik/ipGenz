import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() body: any) {
    const user = await this.authService.validateUser(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(user);
  }

  @Post('register')
  async register(@Body() body: any) {
    return this.authService.register(body.email, body.password);
  }

  @Post('demo-login')
  async demoLogin() {
    const demoUser = await this.authService.validateUser('demo@ipgenz.com', 'DemoAppSecret123!');
    if (!demoUser) {
      throw new UnauthorizedException('Demo account not configured properly');
    }
    return this.authService.login(demoUser);
  }
}
