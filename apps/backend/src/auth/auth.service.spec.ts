import { AuthService } from './auth.service';
import { UserRole } from '@interview-assistant/shared';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'generated-uuid') }));

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('AuthService password reset flow', () => {
  it('returns both recovery methods for an active freelancer with a phone number', async () => {
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'freelancer@example.com',
        role: UserRole.FREELANCER,
      }),
    };
    const freelancerRepo = {
      findOne: jest.fn().mockResolvedValue({
        userId: 'user-1',
        phone: '0909123456',
        isActive: true,
      }),
    };
    const service = new AuthService(
      userRepo as any,
      {} as any,
      freelancerRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.checkPasswordResetLogin('freelancer@example.com');

    expect(result).toEqual({
      exists: true,
      availableMethods: ['PHONE', 'EMAIL'],
    });
  });

  it('keeps the password-reset response contract and sends a six-digit OTP', async () => {
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'Test User',
      }),
    };
    const passwordResetRepo = {
      create: jest.fn((value: Record<string, unknown>) => ({ id: 'challenge-1', ...value })),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const mailService = { sendMail: jest.fn().mockResolvedValue(true) };
    const service = new AuthService(
      userRepo as any,
      passwordResetRepo as any,
      {} as any,
      {} as any,
      passwordResetRepo as any,
      {} as any,
      {} as any,
      mailService as any,
    );

    const result = await service.requestPasswordReset(' user@example.com ');
    const plainTextEmail = mailService.sendMail.mock.calls[0][3] as string;

    expect(result.challengeId).toBe('challenge-1');
    expect(result.email).toBe('u***@example.com');
    expect(result.message).toContain('Mã xác nhận');
    expect(plainTextEmail.match(/\b[0-9]{6}\b/g)).toHaveLength(1);
    expect(passwordResetRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      otpHash: expect.any(String),
    }));
  });
});
