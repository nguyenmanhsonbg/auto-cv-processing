import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAmisApplicationStageDto } from './update-amis-application-stage.dto';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('UpdateAmisApplicationStageDto', () => {
  it('accepts AMIS round type 0 for the previous round', async () => {
    const dto = plainToInstance(UpdateAmisApplicationStageDto, {
      recruitmentRoundId: '265432',
      recruitmentRoundName: 'Phỏng vấn 2',
      recruitmentRoundType: 3,
      recruitmentRoundSortOrder: 5,
      previousRecruitmentRoundId: '265431',
      previousRecruitmentRoundName: 'Test trước phỏng vấn 2',
      previousRecruitmentRoundType: 0,
      previousRecruitmentRoundSortOrder: 4,
      isTransitionEvent: true,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
