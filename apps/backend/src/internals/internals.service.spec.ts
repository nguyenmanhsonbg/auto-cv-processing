import { BadRequestException } from '@nestjs/common';
import { InternalsService } from './internals.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('InternalsService.resolveOrCreateActiveByEmail', () => {
  function createService() {
    const internalRepo = {
      findOne: jest.fn(),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({
        id: 'internal-created',
        ...value,
      })),
    };
    const service = new InternalsService(internalRepo as any, {} as any);
    const manager = {
      getRepository: jest.fn(() => internalRepo),
    };

    return { service, internalRepo, manager };
  }

  it('reuses an existing active Internal for a normalized email', async () => {
    const { service, internalRepo, manager } = createService();
    const existing = {
      id: 'internal-1',
      email: 'user@viettel.com.vn',
      isActive: true,
    };
    internalRepo.findOne.mockResolvedValue(existing);

    await expect(service.resolveOrCreateActiveByEmail(' USER@VIETTEL.COM.VN ', manager as any))
      .resolves.toBe(existing);
    expect(internalRepo.save).not.toHaveBeenCalled();
  });

  it('creates an active Internal when the normalized email is unknown', async () => {
    const { service, internalRepo, manager } = createService();
    internalRepo.findOne.mockResolvedValue(null);

    await expect(service.resolveOrCreateActiveByEmail('new.user@viettel.com.vn', manager as any))
      .resolves.toMatchObject({
        email: 'new.user@viettel.com.vn',
        isActive: true,
      });
    expect(internalRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new.user@viettel.com.vn',
        isActive: true,
      }),
    );
  });

  it('rejects an inactive Internal instead of creating a duplicate', async () => {
    const { service, internalRepo, manager } = createService();
    internalRepo.findOne.mockResolvedValue({
      id: 'internal-1',
      email: 'user@viettel.com.vn',
      isActive: false,
    });

    let error: unknown;
    try {
      await service.resolveOrCreateActiveByEmail('user@viettel.com.vn', manager as any);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_INTERNAL_EMAIL',
    });
    expect(internalRepo.save).not.toHaveBeenCalled();
  });
});
