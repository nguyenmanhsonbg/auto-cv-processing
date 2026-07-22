import { ApplicationsService } from './applications.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ApplicationsService public candidate identity matching', () => {
  it('requires name, email, and phone when resolving a public candidate', async () => {
    const queryBuilder: any = {
      where: jest.fn(() => queryBuilder),
      orderBy: jest.fn(() => queryBuilder),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const manager = {
      getRepository: () => ({
        createQueryBuilder: () => queryBuilder,
      }),
    };
    const service = Object.create(ApplicationsService.prototype) as ApplicationsService;

    await (service as any).findExistingCandidate(
      manager,
      'candidate name',
      'candidate@example.com',
      '0337314321',
    );

    expect(queryBuilder.where).toHaveBeenCalledWith(
      '(LOWER(TRIM(candidate.name)) = :name AND LOWER(candidate.email) = :email AND candidate.phone = :phone)',
      { name: 'candidate name', email: 'candidate@example.com', phone: '0337314321' },
    );
  });

  it('does not treat one matching identity field as an existing application candidate', async () => {
    const queryBuilder: any = {
      leftJoinAndSelect: jest.fn(() => queryBuilder),
      where: jest.fn(() => queryBuilder),
      andWhere: jest.fn(() => queryBuilder),
      orderBy: jest.fn(() => queryBuilder),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const manager = {
      getRepository: () => ({
        createQueryBuilder: () => queryBuilder,
      }),
    };
    const service = Object.create(ApplicationsService.prototype) as ApplicationsService;

    await (service as any).findDuplicateApplicationByIdentity(
      manager,
      'job-1',
      { id: 'candidate-1', name: 'Candidate Name' },
      { name: 'Candidate Name', email: 'candidate@example.com', phone: '0337314321' },
    );

    expect(queryBuilder.andWhere.mock.calls[0][0]).toContain(
      '(LOWER(TRIM(candidate.name)) = :name AND LOWER(candidate.email) = :email AND candidate.phone = :phone)',
    );
  });
});
