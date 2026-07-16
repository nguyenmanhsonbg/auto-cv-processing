import { FacebookPublishingService } from './facebook-publishing.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('FacebookPublishingService preview generation', () => {
  it('uses AI content for a preview when Gemini succeeds', async () => {
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
    });

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
    });

    expect(content).toEqual({ content: 'Facebook post', mode: 'TEMPLATE' });
    expect(contentService.buildFromSnapshot).toHaveBeenCalledWith({ title: 'Backend Engineer' });
  });
});
