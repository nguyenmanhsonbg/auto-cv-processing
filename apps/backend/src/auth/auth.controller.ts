import { UserRole } from '@interview-assistant/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Roles } from './decorators/roles.decorator';
import { ChangePasswordDto, CompletePasswordResetDto, CreateUserDto, LoginDto, LogoutDto, RefreshTokenDto, RequestInternalPasswordDto, RequestPasswordResetDto, UpdateUserDto, VerifyPasswordResetDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RateLimiterService } from '../common/services/rate-limiter.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
    private rateLimiter: RateLimiterService,
  ) {
    // Configure progressive rate limits
    this.rateLimiter.configure('login', {
      ttls: [60_000, 120_000, 180_000],
      maxAttempts: 3,
    });
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Login with email or freelancer identifier and password' })
  async login(@Request() req: any, @Body() dto: LoginDto) {
    const key = `login:${dto.login}`;
    const check = this.rateLimiter.check(key);

    if (!check.allowed) {
      const seconds = Math.ceil(check.waitMs / 1000);
      req.res?.status(429).json({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Đăng nhập thất bại quá nhiều. Vui lòng thử lại sau ${seconds} giây.`,
        waitMs: check.waitMs,
        attemptCount: check.attemptCount,
      });
      return;
    }

    try {
      const result = await this.authService.login(req.user);
      this.rateLimiter.recordSuccess(key);
      return result;
    } catch (error) {
      const failResult = this.rateLimiter.recordFailed(key);
      if (failResult.isLocked) {
        const status = this.rateLimiter.getStatus(key);
        const seconds = Math.ceil(status.waitMs / 1000);
        throw {
          statusCode: 429,
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Tài khoản bị tạm khóa. Vui lòng thử lại sau ${seconds} giây.`,
          waitMs: status.waitMs,
          attemptCount: status.attemptCount,
        };
      }
      throw error;
    }
  }

  @Post('internal/request-password')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Send a generated password to an active internal employee' })
  async requestInternalPassword(@Body() dto: RequestInternalPasswordDto) {
    return this.authService.requestInternalPassword(dto.email);
  }

  @Post('password-reset/request')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.login);
  }

  @Post('password-reset/verify')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async verifyPasswordReset(@Body() dto: VerifyPasswordResetDto) {
    return this.authService.verifyPasswordReset(dto.challengeId, dto.otp);
  }

  @Post('password-reset/complete')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async completePasswordReset(@Body() dto: CompletePasswordResetDto) {
    return this.authService.completePasswordReset(dto);
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Rotate refresh token and issue a new access token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  async logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@Request() req: any) {
    return this.authService.findById(req.user.id);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the current user password' })
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto);
  }

  // ── User assignment dropdown (any authenticated user) ──

  @Get('users/assignable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List users for assign dropdown (id/name/email/role)' })
  async listAssignableUsers() {
    return this.authService.listAssignableUsers();
  }

  // ── User management endpoints (admin only) ──

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List users (paginated, admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'role', required: false })
  async listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.authService.listUsersPaginated({
      page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined,
      search, role, sortBy, sortOrder,
    });
  }

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new user (admin only)' })
  async createUser(@Body() dto: CreateUserDto) {
    return this.authService.createUser(dto);
  }

  @Put('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a user (admin only)' })
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.authService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a user (admin only)' })
  async deleteUser(@Param('id') id: string) {
    return this.authService.deleteUser(id);
  }

  // ── Google OAuth ──

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Redirect to Google OAuth' })
  googleAuth() {
    // Passport handles the redirect
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(@Request() req: any, @Res() res: any) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3001');
    try {
      const result = await req.user; // set by GoogleStrategy.validate()
      const params = new URLSearchParams({
        token: result.accessToken,
        refreshToken: result.refreshToken,
      });
      return res.redirect(`${frontendUrl}/auth/google/callback?${params.toString()}`);
    } catch {
      return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    }
  }
}
