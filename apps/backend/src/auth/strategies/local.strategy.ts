import { Injectable, BadRequestException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new BadRequestException('Request payload is invalid.');
    }

    const user = await this.authService.validateUser(email, password);
    if (!user) {
      throw new BadRequestException('Invalid credentials');
    }
    return user;
  }
}
