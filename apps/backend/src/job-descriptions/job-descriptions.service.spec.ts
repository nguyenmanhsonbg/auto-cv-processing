import { JobDescriptionsService } from './job-descriptions.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('JobDescriptionsService.findPaginated', () => {
  it('sorts search results through a selected rank alias', async () => {
    const queryBuilder: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn((sort: string) => {
        if (sort.includes('CASE')) {
          throw new Error('"CASE WHEN LOWER(jd.title)" alias was not found');
        }
        return queryBuilder;
      }),
      addOrderBy: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new JobDescriptionsService(
      repository as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.findPaginated({ search: 'sam' })).resolves.toMatchObject({
      data: [],
      total: 0,
    });
    expect(queryBuilder.addSelect).toHaveBeenCalledWith(
      expect.stringContaining('LOWER(jd.title)'),
      'search_rank',
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('search_rank', 'ASC');
  });
});
