import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { UserEntity } from './entities/user.entity';
import { RegisterDto, CreateUserDto, UpdateUserDto } from './dto/login.dto';
import { UserRole, PaginatedResponse } from '@interview-assistant/shared';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password: _, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: { id: string; email: string; role: string; name: string }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    };
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
