import { Injectable, BadRequestException, UnauthorizedException, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { UserEntity } from './entities/user.entity';
import { UserRoleMembershipEntity } from './entities/user-role-membership.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { ChangePasswordDto, CompletePasswordResetDto, RegisterDto, CreateUserDto, UpdateUserDto } from './dto/login.dto';
import { UserRole, PaginatedResponse } from '@interview-assistant/shared';
import { FreelancerEntity } from '../freelancers/entities/freelancer.entity';
import { InternalEntity } from '../internals/entities/internal.entity';
import { MailService } from '../notification/mail.service';
import { PasswordResetRequestEntity } from './entities/password-reset-request.entity';
import { generatePasswordResetOtp } from './otp.util';
import { EvaluationHandoffEntity } from './entities/evaluation-handoff.entity';
import { RoleAwareUser, getUserRoles, hasUserRole } from './role-utils';

const EVALUATION_HANDOFF_TTL_MS = 60_000;

type SafeUser = Omit<UserEntity, 'password' | 'roleMemberships'> & { roles: UserRole[] };

export interface EvaluationAmisContext {
  amisUserId?: string | null;
  amisRecruitmentId?: string | null;
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepo: Repository<RefreshTokenEntity>,
    @InjectRepository(FreelancerEntity)
    private readonly freelancerRepo: Repository<FreelancerEntity>,
    @InjectRepository(InternalEntity)
    private readonly internalRepo: Repository<InternalEntity>,
    @InjectRepository(PasswordResetRequestEntity)
    private readonly passwordResetRepo: Repository<PasswordResetRequestEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    @Optional()
    @InjectRepository(EvaluationHandoffEntity)
    private readonly evaluationHandoffRepo?: Repository<EvaluationHandoffEntity>,
    @Optional()
    @InjectRepository(UserRoleMembershipEntity)
    private readonly roleMembershipRepo?: Repository<UserRoleMembershipEntity>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultAdmin();
    await this.seedDevelopmentUsers();
  }

  async validateUser(login: string, password: string) {
    const normalizedLogin = typeof login === 'string' ? login.trim() : '';
    if (!normalizedLogin) return null;

    let user = await this.userRepo.findOne({ where: { email: normalizedLogin } });
    let freelancer = user
      ? await this.freelancerRepo.findOne({ where: { userId: user.id } })
      : null;
    if (!user) {
      freelancer = await this.freelancerRepo.findOne({
        where: { identifier: normalizedLogin.toUpperCase() },
        relations: { user: true },
      });
      user = freelancer?.user ?? null;
    }

    if (user && (await bcrypt.compare(password, user.password))) {
      if (
        user.role === UserRole.FREELANCER
        && freelancer
        && password === freelancer.identifier
        && !user.mustChangePassword
      ) {
        user.mustChangePassword = true;
        await this.userRepo.save(user);
      }
      await this.assertUserCanAuthenticate(user);
      const { password: _, ...result } = user;
      return result;
    }
    return null;
  }

  private async seedDefaultAdmin() {
    const email = this.configService.get<string>('DEFAULT_ADMIN_EMAIL')?.trim();
    const password = this.configService.get<string>('DEFAULT_ADMIN_PASSWORD')?.trim();
    const name = this.configService.get<string>('DEFAULT_ADMIN_NAME')?.trim() || 'Default Admin';

    if (!email || !password) return;

    await this.seedUserIfMissing({
      email,
      name,
      password,
      role: UserRole.ADMIN,
    });
  }

  private async seedDevelopmentUsers() {
    if (this.configService.get<string>('NODE_ENV') === 'production') return;

    const password = 'Test@123456';
    await Promise.all([
      this.seedUserIfMissing({
        email: 'admin.test@example.com',
        name: 'Admin Test',
        password,
        role: UserRole.ADMIN,
      }),
      this.seedUserIfMissing({
        email: 'hr.test@example.com',
        name: 'HR Test',
        password,
        role: UserRole.HR,
      }),
      this.seedUserIfMissing({
        email: 'interviewer.test@example.com',
        name: 'Interviewer Test',
        password,
        role: UserRole.INTERVIEWER,
      }),
    ]);
  }

  private async seedUserIfMissing(input: {
    email: string;
    name: string;
    password: string;
    role: UserRole;
  }) {
    const existing = await this.userRepo.findOne({ where: { email: input.email } });
    if (existing) return;

    await this.userRepo.save(
      this.userRepo.create({
        email: input.email,
        name: input.name,
        password: await bcrypt.hash(input.password, 10),
        role: input.role,
      }),
    );
  }

  async login(
    user: { id: string; email: string; role: UserRole; name: string; mustChangePassword?: boolean; roles?: readonly UserRole[] },
    amisContext?: EvaluationAmisContext,
  ) {
    const roles = await this.getRolesForUser(user.id, user.role, user.roles);
    await this.assertUserCanAuthenticate({ ...user, roles });
    const refreshToken = await this.createRefreshToken(user.id, amisContext);
    return {
      accessToken: this.signAccessToken(user, roles, amisContext),
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, roles },
      mustChangePassword: user.mustChangePassword ?? false,
    };
  }

  async requestInternalPassword(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const internal = await this.internalRepo.findOne({
      where: { email: normalizedEmail, isActive: true },
      relations: { user: true },
    });
    if (!internal) {
      throw new BadRequestException({
        code: 'INTERNAL_EMAIL_NOT_FOUND',
        message: 'Gmail nội bộ nhân sự chưa tồn tại hoặc đã bị vô hiệu hóa.',
      });
    }

    const generatedPassword = this.generateInternalPassword();
    const manager = this.userRepo.manager;

    await manager.transaction(async (transactionManager) => {
      let user = internal.user;
      if (user && !await this.userHasPersistedRole(user.id, UserRole.INTERNAL, user.role)) {
        throw new BadRequestException({
          code: 'INTERNAL_ACCOUNT_CONFLICT',
          message: 'Email này đã được liên kết với loại tài khoản khác.',
        });
      }

      if (!user) {
        const existingUser = await transactionManager.findOne(UserEntity, {
          where: { email: normalizedEmail },
        });
        if (existingUser && !await this.userHasPersistedRole(existingUser.id, UserRole.INTERNAL, existingUser.role)) {
          throw new BadRequestException({
            code: 'INTERNAL_ACCOUNT_CONFLICT',
            message: 'Email này đã được liên kết với loại tài khoản khác.',
          });
        }
        user = existingUser ?? transactionManager.create(UserEntity, {
          email: normalizedEmail,
          name: internal.name?.trim() || normalizedEmail,
          role: UserRole.INTERNAL,
          password: '',
        });
      }

      user.password = await bcrypt.hash(generatedPassword, 10);
      user.role = UserRole.INTERNAL;
      user.mustChangePassword = true;

      const sent = await this.mailService.sendMail(
        normalizedEmail,
        'Mật khẩu đăng nhập Extension Tuyển dụng VCS',
        this.buildInternalPasswordEmail(internal.name, generatedPassword),
        `Xin chào ${internal.name?.trim() || 'bạn'},\n\nMật khẩu đăng nhập Extension của bạn là: ${generatedPassword}\n\nVui lòng bảo mật thông tin này.`,
      );
      if (!sent) {
        throw new BadRequestException({
          code: 'INTERNAL_PASSWORD_EMAIL_FAILED',
          message: 'Không thể gửi email mật khẩu. Vui lòng kiểm tra cấu hình SMTP và thử lại sau.',
        });
      }

      user = await transactionManager.save(UserEntity, user);
      await this.ensureRoleMembership(user.id, UserRole.INTERNAL, transactionManager.getRepository(UserRoleMembershipEntity));
      if (!internal.userId || internal.userId !== user.id) {
        internal.userId = user.id;
        await transactionManager.save(InternalEntity, internal);
      }
      await transactionManager
        .createQueryBuilder()
        .update(RefreshTokenEntity)
        .set({ revokedAt: new Date() })
        .where('user_id = :userId', { userId: user.id })
        .andWhere('revoked_at IS NULL')
        .execute();
    });

    return { message: 'Mật khẩu đã được gửi tới email nội bộ của bạn.' };
  }

  async checkPasswordResetLogin(login: string) {
    const normalizedLogin = login.trim();
    const user = await this.findUserForPasswordReset(normalizedLogin);
    if (!user) {
      const internal = await this.internalRepo.findOne({
        where: { email: normalizedLogin.toLowerCase(), isActive: true },
        relations: { user: true },
      });
      if (internal) {
        return { exists: false, hint: 'INTERNAL_PASSWORD_REQUIRED' as const };
      }
      return { exists: false, hint: 'INVALID_LOGIN' as const };
    }
        // HR and ADMIN roles are not allowed to use password reset.
    if (user.role === UserRole.HR || user.role === UserRole.ADMIN) {
      return { exists: false, hint: 'HR_NOT_ALLOWED' as const };
    }
    return {
      exists: true,
      availableMethods: await this.getPasswordResetMethods(user),
    };
  }

  async requestPasswordReset(login: string) {
    const normalizedLogin = login.trim();
    const user = await this.findUserForPasswordReset(normalizedLogin);
    if (!user) {
      const internal = await this.internalRepo.findOne({
        where: { email: normalizedLogin.toLowerCase(), isActive: true },
        relations: { user: true },
      });
      if (internal) {
        throw new BadRequestException({
          code: 'INTERNAL_PASSWORD_REQUIRED',
          message: 'Nhân sự nội bộ chưa có tài khoản đăng nhập. Vui lòng chọn “Là nhân sự nội bộ” để lấy mật khẩu lần đầu.',
        });
      }
      throw new BadRequestException({ code: 'INVALID_LOGIN', message: 'Tên đăng nhập không hợp lệ. Vui lòng kiểm tra lại.' });
    }

    const otp = generatePasswordResetOtp();
    const request = this.passwordResetRepo.create({
      userId: user.id,
      otpHash: await bcrypt.hash(otp, 10),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      attempts: 0,
      verifiedAt: null,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    });
    await this.passwordResetRepo.save(request);
    const sent = await this.mailService.sendMail(
      user.email,
      'Mã xác nhận khôi phục mật khẩu Tuyển dụng VCS',
      `<p>Xin chào ${user.name},</p><p>Mã xác nhận khôi phục mật khẩu của bạn là:</p><h2>${otp}</h2><p>Mã có hiệu lực trong 15 phút.</p>`,
      `Mã xác nhận khôi phục mật khẩu của bạn là: ${otp}. Mã có hiệu lực trong 15 phút.`,
    );
    if (!sent) throw new BadRequestException({ code: 'PASSWORD_RESET_EMAIL_FAILED', message: 'Không thể gửi mã xác nhận. Vui lòng thử lại sau.' });
    return { challengeId: request.id, email: user.email, message: 'Mã xác nhận đã được gửi tới Gmail của bạn.' };
  }

  async verifyPasswordReset(challengeId: string, otp: string) {
    const request = await this.passwordResetRepo.findOne({ where: { id: challengeId } });
    if (!request || request.expiresAt.getTime() < Date.now() || request.attempts >= 5) {
      throw new BadRequestException({ code: 'INVALID_OTP', message: 'OTP không đúng. Vui lòng kiểm tra lại.' });
    }
    request.attempts += 1;
    if (!(await bcrypt.compare(otp, request.otpHash))) {
      await this.passwordResetRepo.save(request);
      throw new BadRequestException({ code: 'INVALID_OTP', message: 'OTP không đúng. Vui lòng kiểm tra lại.' });
    }
    const resetToken = randomBytes(32).toString('hex');
    request.verifiedAt = new Date();
    request.resetTokenHash = this.hashToken(resetToken);
    request.resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.passwordResetRepo.save(request);
    return { resetToken, message: 'Xác nhận OTP thành công.' };
  }

  async completePasswordReset(input: CompletePasswordResetDto) {
    if (input.newPassword !== input.confirmPassword) throw new BadRequestException('Mật khẩu mới không khớp.');
    if (!this.isStrongPassword(input.newPassword)) throw new BadRequestException('Mật khẩu mới không hợp lệ. Vui lòng nhập lại.');
    const request = await this.passwordResetRepo.findOne({ where: { resetTokenHash: this.hashToken(input.resetToken) } });
    if (!request || !request.verifiedAt || !request.resetTokenExpiresAt || request.resetTokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ code: 'INVALID_RESET_TOKEN', message: 'Phiên khôi phục mật khẩu đã hết hạn.' });
    }
    const user = await this.userRepo.findOne({ where: { id: request.userId } });
    if (!user) throw new BadRequestException('Không tìm thấy tài khoản.');
    if (await bcrypt.compare(input.newPassword, user.password)) {
      throw new BadRequestException('Mật khẩu mới không được trùng với mật khẩu gần nhất.');
    }
    user.password = await bcrypt.hash(input.newPassword, 10);
    await this.userRepo.save(user);
    await this.refreshTokenRepo.update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
    await this.passwordResetRepo.delete(request.id);
    return { message: 'Đổi mật khẩu thành công.' };
  }

  private async findUserForPasswordReset(login: string) {
    const byEmail = await this.userRepo.findOne({ where: { email: login.toLowerCase() } });
    if (byEmail) return byEmail;
    const freelancer = await this.freelancerRepo.findOne({ where: { identifier: login.toUpperCase() }, relations: { user: true } });
    if (freelancer?.user) return freelancer.user;
    const internal = await this.internalRepo.findOne({
      where: { email: login.toLowerCase(), isActive: true },
      relations: { user: true },
    });
    return internal?.user ?? null;
  }

  private async getPasswordResetMethods(user: UserEntity) {
    if (user.role !== UserRole.FREELANCER) return ['EMAIL'] as const;

    const freelancer = await this.freelancerRepo.findOne({
      where: { userId: user.id, isActive: true },
    });
    return freelancer?.phone?.trim() ? ['PHONE', 'EMAIL'] as const : ['EMAIL'] as const;
  }

  private hashToken(value: string) { return createHash('sha256').update(value).digest('hex'); }

  private maskEmail(email: string) {
    const [name, domain] = email.split('@');
    return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, name.length - 1))}@${domain}`;
  }

  private isStrongPassword(value: string) {
    return value.length >= 8 && value.length <= 16 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const existingToken = await this.refreshTokenRepo.findOne({
      where: { tokenHash },
      relations: { user: true },
    });

    if (
      !existingToken ||
      existingToken.revokedAt ||
      existingToken.expiresAt.getTime() <= Date.now() ||
      !existingToken.user
    ) {
      if (existingToken && !existingToken.revokedAt) {
        existingToken.revokedAt = new Date();
        await this.refreshTokenRepo.save(existingToken);
      }
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    const nextRefreshToken = this.generateRefreshToken();
    const nextTokenHash = this.hashRefreshToken(nextRefreshToken);
    existingToken.revokedAt = new Date();
    existingToken.replacedByTokenHash = nextTokenHash;

    try {
      const roles = await this.getRolesForUser(existingToken.user.id, existingToken.user.role);
      await this.assertUserCanAuthenticate({ ...existingToken.user, roles });
    } catch (error) {
      await this.refreshTokenRepo.save(existingToken);
      throw error;
    }

    const nextTokenEntity = this.refreshTokenRepo.create({
      userId: existingToken.userId,
      amisUserId: existingToken.amisUserId,
      amisRecruitmentId: existingToken.amisRecruitmentId,
      tokenHash: nextTokenHash,
      expiresAt: this.getRefreshTokenExpiryDate(),
      revokedAt: null,
      replacedByTokenHash: null,
    });
    await this.refreshTokenRepo.save([existingToken, nextTokenEntity]);

    const roles = await this.getRolesForUser(existingToken.user.id, existingToken.user.role);

    return {
      accessToken: this.signAccessToken(existingToken.user, roles, {
        amisUserId: existingToken.amisUserId,
        amisRecruitmentId: existingToken.amisRecruitmentId,
      }),
      refreshToken: nextRefreshToken,
      user: {
        id: existingToken.user.id,
        email: existingToken.user.email,
        role: existingToken.user.role,
        roles,
      },
      mustChangePassword: existingToken.user.mustChangePassword ?? false,
    };
  }

  async logout(refreshToken?: string | null) {
    const normalized = refreshToken?.trim();
    if (!normalized) return { message: 'Logged out' };

    const tokenHash = this.hashRefreshToken(normalized);
    const existingToken = await this.refreshTokenRepo.findOne({ where: { tokenHash } });
    if (existingToken && !existingToken.revokedAt) {
      existingToken.revokedAt = new Date();
      await this.refreshTokenRepo.save(existingToken);
    }

    return { message: 'Logged out' };
  }

  async createEvaluationHandoff(
    userId: string,
    applicationId: string,
    amisContext?: EvaluationAmisContext,
  ) {
    const evaluationHandoffRepo = this.getEvaluationHandoffRepo();
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('Không tìm thấy tài khoản.');

    const handoffToken = `eh_${randomBytes(32).toString('base64url')}`;
    const handoff = evaluationHandoffRepo.create({
      userId,
      applicationId,
      amisUserId: this.normalizeOptionalContextValue(amisContext?.amisUserId),
      amisRecruitmentId: this.normalizeOptionalContextValue(amisContext?.amisRecruitmentId),
      tokenHash: this.hashToken(handoffToken),
      expiresAt: new Date(Date.now() + EVALUATION_HANDOFF_TTL_MS),
      usedAt: null,
    });
    await evaluationHandoffRepo.save(handoff);

    return {
      handoffToken,
      expiresAt: handoff.expiresAt.toISOString(),
    };
  }

  async exchangeEvaluationHandoff(handoffToken: string, applicationId: string) {
    const evaluationHandoffRepo = this.getEvaluationHandoffRepo();
    const handoff = await evaluationHandoffRepo.findOne({
      where: { tokenHash: this.hashToken(handoffToken) },
    });
    if (!handoff || handoff.applicationId !== applicationId || handoff.usedAt || handoff.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Evaluation handoff is invalid or expired.');
    }

    const claimResult = await evaluationHandoffRepo
      .createQueryBuilder()
      .update(EvaluationHandoffEntity)
      .set({ usedAt: new Date() })
      .where('id = :id', { id: handoff.id })
      .andWhere('used_at IS NULL')
      .andWhere('expires_at > NOW()')
      .execute();
    if (claimResult.affected !== 1) {
      throw new UnauthorizedException('Evaluation handoff is invalid or expired.');
    }

    const user = await this.userRepo.findOne({ where: { id: handoff.userId } });
    if (!user) throw new UnauthorizedException('Evaluation handoff user is unavailable.');
    await this.assertUserCanAuthenticate(user);
    return this.login(user, {
      amisUserId: handoff.amisUserId,
      amisRecruitmentId: handoff.amisRecruitmentId,
    });
  }

  private getEvaluationHandoffRepo() {
    if (!this.evaluationHandoffRepo) {
      throw new BadRequestException('Evaluation handoff storage is unavailable.');
    }
    return this.evaluationHandoffRepo;
  }

  private signAccessToken(
    user: { id: string; email: string; role: string },
    roles: UserRole[],
    amisContext?: EvaluationAmisContext,
  ) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      roles,
      ...(this.normalizeOptionalContextValue(amisContext?.amisUserId)
        ? { amisUserId: this.normalizeOptionalContextValue(amisContext?.amisUserId) }
        : {}),
      ...(this.normalizeOptionalContextValue(amisContext?.amisRecruitmentId)
        ? { amisRecruitmentId: this.normalizeOptionalContextValue(amisContext?.amisRecruitmentId) }
        : {}),
    };
    return this.jwtService.sign(payload);
  }

  private normalizeOptionalContextValue(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized || null;
  }

  private async createRefreshToken(userId: string, amisContext?: EvaluationAmisContext) {
    const refreshToken = this.generateRefreshToken();
    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        userId,
        amisUserId: this.normalizeOptionalContextValue(amisContext?.amisUserId),
        amisRecruitmentId: this.normalizeOptionalContextValue(amisContext?.amisRecruitmentId),
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: this.getRefreshTokenExpiryDate(),
        revokedAt: null,
        replacedByTokenHash: null,
      }),
    );
    return refreshToken;
  }

  private generateRefreshToken() {
    return `rt_${randomBytes(64).toString('base64url')}`;
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private getRefreshTokenExpiryDate() {
    const ttlDays = Number(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN_DAYS', '7'));
    const safeTtlDays = Number.isFinite(ttlDays) && ttlDays > 0 ? Math.min(ttlDays, 365) : 7;
    return new Date(Date.now() + safeTtlDays * 24 * 60 * 60 * 1000);
  }

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      email: dto.email,
      name: dto.name,
      password: hashedPassword,
      role: UserRole.INTERVIEWER,
    });
    const saved = await this.userRepo.save(user);
    await this.syncRoleMemberships(saved.id, [saved.role]);
    const { password: _, ...result } = saved;
    return { ...result, roles: [saved.role] };
  }

  async findById(id: string): Promise<SafeUser | null> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) return null;

    return this.toSafeUser(user);
  }

  async changePassword(userId: string, input: ChangePasswordDto) {
    if (input.newPassword !== input.confirmPassword) {
      throw new BadRequestException('Mật khẩu mới không khớp.');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('Không tìm thấy tài khoản.');
    if (!(await bcrypt.compare(input.currentPassword, user.password))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng.');
    }
    if (input.newPassword === input.currentPassword || await bcrypt.compare(input.newPassword, user.password)) {
      throw new BadRequestException('Mật khẩu mới không được trùng với mật khẩu gần nhất.');
    }

    user.password = await bcrypt.hash(input.newPassword, 10);
    user.mustChangePassword = false;
    await this.userRepo.save(user);
    await this.refreshTokenRepo.update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
    return { message: 'Đổi mật khẩu thành công.' };
  }

  // ── User assignment dropdown (all authenticated users) ──

  async listAssignableUsers(): Promise<{ id: string; name: string; email: string; role: string; roles: UserRole[] }[]> {
    const users = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleMemberships', 'roleMembership')
      .select(['user.id', 'user.name', 'user.email', 'user.role', 'roleMembership.id', 'roleMembership.role'])
      .orderBy('user.name', 'ASC')
      .getMany();

    return (await Promise.all(users.map((user) => this.toSafeUser(user))))
      .filter((user) => !user.roles.includes(UserRole.FREELANCER))
      .map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roles: user.roles,
      }));
  }

  // ── User management (admin) ──

  async listUsers(): Promise<SafeUser[]> {
    const users = await this.userRepo.find({ order: { createdAt: 'DESC' } });
    return Promise.all(users.map((user) => this.toSafeUser(user)));
  }

  async listUsersPaginated(params: { page?: number; limit?: number; search?: string; role?: string; sortBy?: string; sortOrder?: 'ASC' | 'DESC' }): Promise<PaginatedResponse<SafeUser>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortOrder = params.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const allowedSorts: Record<string, string> = { name: 'u.name', email: 'u.email', role: 'u.role', createdAt: 'u.createdAt' };
    const sortCol = allowedSorts[params.sortBy ?? ''] ?? 'u.createdAt';

    const qb = this.userRepo.createQueryBuilder('u').orderBy(sortCol, sortOrder);

    if (params.search) {
      qb.andWhere('(u.name ILIKE :search OR u.email ILIKE :search)', { search: `%${params.search}%` });
    }
    if (params.role) {
      const roles = params.role.split(',').filter(Boolean);
      if (roles.length > 0) {
        qb.leftJoin('u.roleMemberships', 'filterRoleMembership');
        qb.andWhere('filterRoleMembership.role IN (:...roles)', { roles });
      }
    }

    const [users, total] = await qb.skip(skip).take(limit).getManyAndCount();
    const data = await Promise.all(users.map((user) => this.toSafeUser(user)));
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createUser(dto: CreateUserDto) {
    const roles = this.resolveRequestedRoles(dto.roles, dto.role ?? UserRole.INTERVIEWER);
    this.assertRoleCanUseGenericUserManagement(roles);

    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('A user with this email already exists');

    // Use a random password — the user is expected to log in via Google
    const password = await bcrypt.hash(uuidv4(), 10);
    const user = await this.userRepo.save(
      this.userRepo.create({
        email: dto.email,
        name: dto.name,
        password,
        role: roles[0],
        mustChangePassword: true,
      }),
    );
    await this.syncRoleMemberships(user.id, roles);
    return this.toSafeUser(user);
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new BadRequestException('User not found');

    const currentRoles = await this.getRolesForUser(user.id, user.role);
    const requestedRoles = this.resolveUpdateRoles(dto, currentRoles);

    const hasFreelancerProfile =
      currentRoles.includes(UserRole.FREELANCER)
      || (await this.freelancerRepo.exist({ where: { userId: user.id } }));
    if (hasFreelancerProfile) {
      this.throwFreelancerManagedElsewhere();
    }

    this.assertRoleUpdateAllowed(currentRoles, requestedRoles, user.id);
    if (dto.name !== undefined) user.name = dto.name;
    user.role = requestedRoles[0];
    const saved = await this.userRepo.save(user);
    await this.syncRoleMemberships(saved.id, requestedRoles);
    return this.toSafeUser(saved);
  }

  async deleteUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new BadRequestException('User not found');
    const hasFreelancerProfile =
      user.role === UserRole.FREELANCER
      || (await this.freelancerRepo.exist({ where: { userId: user.id } }));
    if (hasFreelancerProfile) {
      this.throwFreelancerManagedElsewhere();
    }
    await this.userRepo.remove(user);
    return { message: 'User deleted' };
  }

  // ── Google OAuth ──

  async validateGoogleUser(profile: any) {
    const email: string = profile.emails?.[0]?.value;
    if (!email) throw new UnauthorizedException('No email from Google');

    // 1. Existing user → issue JWT
    let user = await this.userRepo.findOne({ where: { email } });
    if (user) return this.login(user);

    // 2. Admin email from env → auto-create as ADMIN
    const adminEmails = (this.configService.get<string>('ADMIN_EMAILS', '') || '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (adminEmails.includes(email)) {
      user = await this.userRepo.save(
        this.userRepo.create({
          email,
          name: profile.displayName || email,
          password: await bcrypt.hash(uuidv4(), 10),
          role: UserRole.ADMIN,
          mustChangePassword: true,
        }),
      );
      return this.login(user);
    }

    throw new UnauthorizedException('No access. Ask your admin to create an account for you.');
  }

  private assertRoleCanUseGenericUserManagement(roles: UserRole[]) {
    if (roles.includes(UserRole.FREELANCER) || roles.includes(UserRole.INTERNAL)) {
      this.throwFreelancerManagedElsewhere();
    }
  }

  private async assertRoleUpdateAllowed(currentRoles: UserRole[], requestedRoles: UserRole[], userId: string) {
    if (currentRoles.includes(UserRole.FREELANCER) || requestedRoles.includes(UserRole.FREELANCER)) {
      this.throwFreelancerManagedElsewhere();
    }

    if (currentRoles.includes(UserRole.INTERNAL) && !requestedRoles.includes(UserRole.INTERNAL)) {
      throw new BadRequestException({
        code: 'INTERNAL_ROLE_MANAGED_ELSEWHERE',
        message: 'Internal role must be managed from the internal employee profile.',
      });
    }

    if (
      requestedRoles.includes(UserRole.INTERNAL)
      && !currentRoles.includes(UserRole.INTERNAL)
      && !(await this.internalRepo.exist({ where: { userId } }))
    ) {
      throw new BadRequestException({
        code: 'INTERNAL_PROFILE_REQUIRED',
        message: 'An active internal employee profile is required for the INTERNAL role.',
      });
    }
  }

  private resolveUpdateRoles(dto: UpdateUserDto, currentRoles: UserRole[]): UserRole[] {
    if (dto.roles?.length) return this.resolveRequestedRoles(dto.roles, dto.roles[0]);
    if (dto.role) return this.resolveRequestedRoles([dto.role], dto.role);
    return currentRoles;
  }

  private resolveRequestedRoles(roles: readonly UserRole[] | undefined, fallback: UserRole): UserRole[] {
    const requestedRoles = roles?.length ? roles : [fallback];
    const validRoles = getUserRoles({ roles: requestedRoles });
    if (validRoles.length !== requestedRoles.length) {
      throw new BadRequestException('One or more requested roles are invalid.');
    }
    return validRoles;
  }

  private async assertUserCanAuthenticate(user: { id: string } & RoleAwareUser) {
    if (hasUserRole(user, UserRole.INTERNAL)) {
      const internal = await this.internalRepo.findOne({
        where: { userId: user.id, isActive: true },
      });
      if (!internal) {
        throw new UnauthorizedException({
          code: 'INTERNAL_ACCOUNT_INACTIVE',
          message: 'Internal account is inactive or unavailable.',
        });
      }
      return;
    }

    if (!hasUserRole(user, UserRole.FREELANCER)) return;

    const freelancer = await this.freelancerRepo.findOne({
      where: {
        userId: user.id,
        isActive: true,
      },
    });

    if (!freelancer) {
      throw new UnauthorizedException({
        code: 'FREELANCER_ACCOUNT_INACTIVE',
        message: 'Freelancer account is inactive or unavailable.',
      });
    }
  }

  private throwFreelancerManagedElsewhere(): never {
    throw new BadRequestException({
      code: 'FREELANCER_MANAGED_ELSEWHERE',
      message: 'Freelancer accounts must be created and managed via the freelancers service.',
    });
  }

  private async getRolesForUser(
    userId: string,
    legacyRole: UserRole | string,
    knownRoles?: readonly UserRole[],
  ): Promise<UserRole[]> {
    let membershipRoles = knownRoles ? [...knownRoles] : [];
    if (membershipRoles.length === 0) {
      const memberships = await this.getRoleMembershipRepository().find({ where: { userId } });
      membershipRoles = memberships.map((membership) => membership.role);
    }

    const roles = getUserRoles({ role: legacyRole, roles: membershipRoles });
    if (roles.length === 0) {
      throw new BadRequestException('User has no valid role.');
    }

    if (membershipRoles.length === 0) {
      await this.ensureRoleMembership(userId, roles[0], this.getRoleMembershipRepository());
    }
    return roles;
  }

  private async userHasPersistedRole(userId: string, role: UserRole, legacyRole: UserRole | string) {
    const roles = await this.getRolesForUser(userId, legacyRole);
    return roles.includes(role);
  }

  private async ensureRoleMembership(
    userId: string,
    role: UserRole,
    repository: Repository<UserRoleMembershipEntity>,
  ) {
    await repository
      .createQueryBuilder()
      .insert()
      .into(UserRoleMembershipEntity)
      .values({ userId, role })
      .orIgnore()
      .execute();
  }

  private async syncRoleMemberships(userId: string, roles: UserRole[]) {
    const repository = this.getRoleMembershipRepository();
    await repository.delete({ userId });
    await repository.insert(roles.map((role) => ({ userId, role })));
  }

  private getRoleMembershipRepository(): Repository<UserRoleMembershipEntity> {
    return this.roleMembershipRepo ?? this.userRepo.manager.getRepository(UserRoleMembershipEntity);
  }

  private async toSafeUser(user: UserEntity): Promise<SafeUser> {
    const { password: _, roleMemberships: __, ...safeUser } = user;
    const knownRoles = user.roleMemberships?.map((membership) => membership.role);
    const roles = await this.getRolesForUser(user.id, user.role, knownRoles);
    return { ...safeUser, roles };
  }

  private generateInternalPassword() {
    return randomBytes(9).toString('base64url').slice(0, 12);
  }

  private buildInternalPasswordEmail(name: string | null, password: string) {
    const displayName = name?.trim() || 'bạn';
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937">
        <p>Xin chào ${displayName},</p>
        <p>Mật khẩu đăng nhập Extension Tuyển dụng VCS của bạn là:</p>
        <p style="font-size: 22px; font-weight: 700; letter-spacing: 2px">${password}</p>
        <p>Vui lòng không chia sẻ mật khẩu này với người khác.</p>
      </div>
    `;
  }
}
