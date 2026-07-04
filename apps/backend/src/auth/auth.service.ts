import { Injectable, BadRequestException, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { UserEntity } from './entities/user.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { RegisterDto, CreateUserDto, UpdateUserDto } from './dto/login.dto';
import { UserRole, PaginatedResponse } from '@interview-assistant/shared';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private refreshTokenRepo: Repository<RefreshTokenEntity>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedDefaultAdmin();
    await this.seedDevelopmentUsers();
  }

  async validateUser(email: string, password: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (user && (await bcrypt.compare(password, user.password))) {
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

  async login(user: { id: string; email: string; role: string; name: string }) {
    const refreshToken = await this.createRefreshToken(user.id);
    return {
      accessToken: this.signAccessToken(user),
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    };
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

    const nextTokenEntity = this.refreshTokenRepo.create({
      userId: existingToken.userId,
      tokenHash: nextTokenHash,
      expiresAt: this.getRefreshTokenExpiryDate(),
      revokedAt: null,
      replacedByTokenHash: null,
    });
    await this.refreshTokenRepo.save([existingToken, nextTokenEntity]);

    return {
      accessToken: this.signAccessToken(existingToken.user),
      refreshToken: nextRefreshToken,
      user: {
        id: existingToken.user.id,
        email: existingToken.user.email,
        role: existingToken.user.role,
        name: existingToken.user.name,
      },
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

  private signAccessToken(user: { id: string; email: string; role: string }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return this.jwtService.sign(payload);
  }

  private async createRefreshToken(userId: string) {
    const refreshToken = this.generateRefreshToken();
    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        userId,
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
    const { password: _, ...result } = saved;
    return result;
  }

  async findById(id: string) {
    return this.userRepo.findOne({ where: { id } });
  }

  // ── User assignment dropdown (all authenticated users) ──

  async listAssignableUsers(): Promise<{ id: string; name: string; email: string; role: string }[]> {
    return this.userRepo.find({
      select: ['id', 'name', 'email', 'role'],
      order: { name: 'ASC' },
    }) as Promise<{ id: string; name: string; email: string; role: string }[]>;
  }

  // ── User management (admin) ──

  async listUsers() {
    const users = await this.userRepo.find({ order: { createdAt: 'DESC' } });
    return users.map(({ password: _, ...u }) => u);
  }

  async listUsersPaginated(params: { page?: number; limit?: number; search?: string; role?: string; sortBy?: string; sortOrder?: 'ASC' | 'DESC' }): Promise<PaginatedResponse<Omit<UserEntity, 'password'>>> {
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
      if (roles.length > 0) qb.andWhere('u.role IN (:...roles)', { roles });
    }

    const [users, total] = await qb.skip(skip).take(limit).getManyAndCount();
    const data = users.map(({ password: _, ...u }) => u) as Omit<UserEntity, 'password'>[];
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createUser(dto: CreateUserDto) {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('A user with this email already exists');

    // Use a random password — the user is expected to log in via Google
    const password = await bcrypt.hash(uuidv4(), 10);
    const user = await this.userRepo.save(
      this.userRepo.create({
        email: dto.email,
        name: dto.name,
        password,
        role: dto.role ?? UserRole.INTERVIEWER,
      }),
    );
    const { password: _, ...result } = user;
    return result;
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new BadRequestException('User not found');
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.role !== undefined) user.role = dto.role;
    const saved = await this.userRepo.save(user);
    const { password: _, ...result } = saved;
    return result;
  }

  async deleteUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new BadRequestException('User not found');
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
        }),
      );
      return this.login(user);
    }

    throw new UnauthorizedException('No access. Ask your admin to create an account for you.');
  }
}
