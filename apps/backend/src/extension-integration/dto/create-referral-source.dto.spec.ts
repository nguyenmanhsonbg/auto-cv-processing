import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFreelancerDto } from '../../freelancers/dto/create-freelancer.dto';
import { CreateInternalDto } from '../../internals/dto/create-internal.dto';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('create referral source DTOs', () => {
  it('requires phone when creating a Freelancer', async () => {
    const dto = plainToInstance(CreateFreelancerDto, {
      name: 'Freelancer Test',
      email: 'freelancer@example.com',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'phone')).toBe(true);
  });

  it('allows an Internal source without phone', async () => {
    const dto = plainToInstance(CreateInternalDto, {
      name: 'Internal Test',
      email: 'internal@viettel.com.vn',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
