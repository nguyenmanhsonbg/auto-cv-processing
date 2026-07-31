import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GenerateFacebookPreviewContentDto } from './generate-facebook-preview-content.dto';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('GenerateFacebookPreviewContentDto', () => {
  it('rejects a null mode', async () => {
    const dto = plainToInstance(GenerateFacebookPreviewContentDto, {
      mode: null,
      snapshot: {
        title: 'Backend Engineer',
        description: 'Build secure services',
        requirements: { rawText: 'Node.js' },
      },
    });

    const errors = await validate(dto);

    expect(errors.some((error: any) => error.property === 'mode')).toBe(true);
  });

  it('rejects a missing mode', async () => {
    const dto = plainToInstance(GenerateFacebookPreviewContentDto, {
      snapshot: {
        title: 'Backend Engineer',
        description: 'Build secure services',
        requirements: { rawText: 'Node.js' },
      },
    });

    const errors = await validate(dto);

    expect(errors.some((error: any) => error.property === 'mode')).toBe(true);
  });
});
