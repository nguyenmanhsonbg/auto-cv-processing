import { Injectable, BadRequestException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'login' });
  }

  async validate(login: string, password: string) {
    if (typeof login !== 'string' || typeof password !== 'string') {
      throw new BadRequestException('Request payload is invalid.');
    }

    const user = await this.authService.validateUser(login, password);
    if (!user) {
      throw new BadRequestException('Invalid credentials');
    }
    return user;
  }
}
