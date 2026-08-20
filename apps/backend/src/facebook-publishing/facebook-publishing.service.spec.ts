import { FacebookPublishingService } from './facebook-publishing.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('FacebookPublishingService preview generation', () => {
  it('excludes failed publish attempts from the Facebook history query', async () => {
    const queryBuilder = {} as any;
    for (const method of ['leftJoinAndSelect', 'select', 'addSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take', 'groupBy']) {
      queryBuilder[method] = jest.fn().mockReturnValue(queryBuilder);
    }
    queryBuilder.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    queryBuilder.getRawMany = jest.fn().mockResolvedValue([]);

    const historiesRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new FacebookPublishingService(
      {} as any,
      {} as any,
      historiesRepo as any,
      {} as any,
      {} as any,
      {} as any,
    );
    (service as any).findOwnedActiveGroup = jest.fn().mockResolvedValue({ id: 'target-1' });

    await service.listExtensionGroupPublishHistories({
      ownerUserId: 'user-1',
      targetId: 'target-1',
      page: 1,
      limit: 10,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'history.status != :failedPublishStatus',
      { failedPublishStatus: 'FAILED' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(2);
  });

  it('stores a pending Facebook group URL as the exact post URL', () => {
    const service = new FacebookPublishingService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const parsed = (service as any).parseFacebookGroupPostUrl(
      'https://www.facebook.com/groups/1934436680847972/pending_posts/1986056959019277',
    );

    expect(parsed).toEqual({
      groupId: '1934436680847972',
      postId: '1986056959019277',
      pathType: 'posts',
      url: 'https://www.facebook.com/groups/1934436680847972/posts/1986056959019277/',
    });
  });

  it('uses the template by default without calling AI', async () => {
    const contentService = {
      buildFromSnapshot: jest.fn().mockReturnValue('Facebook post'),
    };
    const aiService = {
      generateFacebookRecruitmentContent: jest.fn().mockResolvedValue('AI Facebook post'),
    };
    const service = new FacebookPublishingService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      contentService as any,
      aiService as any,
    );

    const snapshot = {
      title: 'Backend Engineer',
      description: 'Build secure services',
      requirements: { rawText: 'Node.js' },
      benefits: 'Health insurance',
      location: 'Ha Noi',
    } as any;

    const content = await service.generateExtensionPreviewContent({
      snapshot,
      mode: 'TEMPLATE',
    });

    expect(content).toEqual({ content: 'Facebook post', mode: 'TEMPLATE' });
    expect(aiService.generateFacebookRecruitmentContent).not.toHaveBeenCalled();
    expect(contentService.buildFromSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('uses AI content only when explicitly requested', async () => {
    const contentService = {
      buildFromSnapshot: jest.fn().mockReturnValue('Facebook post'),
    };
    const aiService = {
      generateFacebookRecruitmentContent: jest.fn().mockResolvedValue('AI Facebook post'),
    };
    const service = new FacebookPublishingService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      contentService as any,
      aiService as any,
    );

    const snapshot = { title: 'Backend Engineer' } as any;
    const content = await service.generateExtensionPreviewContent({ snapshot, mode: 'AI' });

    expect(content).toEqual({ content: 'AI Facebook post', mode: 'AI' });
    expect(aiService.generateFacebookRecruitmentContent).toHaveBeenCalledWith(snapshot);
    expect(contentService.buildFromSnapshot).not.toHaveBeenCalled();
  });

  it('falls back to the template when Gemini generation fails', async () => {
    const contentService = {
      buildFromSnapshot: jest.fn().mockReturnValue('Facebook post'),
    };
    const aiService = {
      generateFacebookRecruitmentContent: jest.fn().mockRejectedValue(new Error('Gemini unavailable')),
    };
    const service = new FacebookPublishingService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      contentService as any,
      aiService as any,
    );

    const content = await service.generateExtensionPreviewContent({
      snapshot: { title: 'Backend Engineer' } as any,
      mode: 'AI',
    });

    expect(content).toEqual({ content: 'Facebook post', mode: 'TEMPLATE' });
    expect(contentService.buildFromSnapshot).toHaveBeenCalledWith({ title: 'Backend Engineer' });
  });
});
