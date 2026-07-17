import { PublicJobPostingsController } from './public-job-postings.controller';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('PublicJobPostingsController CV preflight', () => {
  it('keeps rejecting empty extracted text as a non-CV upload', async () => {
    const parseFile = jest.fn().mockResolvedValue({ rawText: '' });
    const controller = Object.create(PublicJobPostingsController.prototype) as PublicJobPostingsController;
    (controller as any).fileParserService = { parseFile };
    (controller as any).cvSimilarityService = {
      normalizeForSimilarity: jest.fn(),
    };

    await expect(
      (controller as any).extractAndValidateUploadedCvText(
        { path: 'cv.pdf' },
        { name: 'Candidate', email: 'candidate@example.com', phone: '0123456789' },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CV_NOT_RESUME' }),
    });
    expect(parseFile).toHaveBeenCalledWith('cv.pdf');
  });

  function createApplyFixture(options: {
    duplicate: boolean;
    duplicateReason?: 'CANDIDATE_JOB_MATCH' | 'IDEMPOTENT_REPLAY';
    score?: number;
  }) {
    const similarityService = {
      normalizeForSimilarity: jest.fn().mockReturnValue('normalized-uploaded-cv'),
      compare: jest.fn().mockReturnValue({
        score: options.score ?? 0.95,
        isDuplicate: (options.score ?? 0.95) >= 0.95,
        threshold: 0.95,
        methodVersion: 'TFIDF_WORD_NGRAM_V1',
        oldNormalizedTextHash: 'old-hash',
        newNormalizedTextHash: 'new-hash',
        featureCount: 10,
        sharedFeatureCount: 10,
      }),
    };
    const application = {
      id: 'application-1',
      candidateId: 'candidate-1',
      jobPostingId: 'job-1',
      status: 'APPLICATION_CREATED',
      candidate: {
        id: 'candidate-1',
        name: 'Candidate',
        email: 'candidate@example.com',
        phone: '0123456789',
      },
    };
    const applicationResult = {
      application,
      candidate: application.candidate,
      applicationSource: null,
      created: !options.duplicate,
      duplicate: options.duplicate,
      duplicateReason: options.duplicateReason,
    };
    const parsedProfile = {
      id: 'parsed-profile-1',
      applicationId: 'application-1',
      cvDocumentId: 'clean-cv-1',
      candidateId: 'candidate-1',
      parsedData: {
        rawText: 'Candidate candidate@example.com Python built ETL pipelines '.repeat(8),
      },
      cvDocument: { id: 'clean-cv-1' },
    };
    const cvDocumentsService = {
      uploadOriginalCv: jest.fn().mockResolvedValue({ id: 'original-cv-1' }),
      sanitizeOriginalCvAfterScanPass: jest.fn().mockResolvedValue({ id: 'clean-cv-1' }),
      extractCleanCvText: jest.fn(),
    };
    const cvParsingService = {
      parseCleanCvDocument: jest.fn().mockResolvedValue(parsedProfile),
    };
    const applicationsService = {
      assertPublicApplyRateLimit: jest.fn(),
      recordPublicApplyReceived: jest.fn(),
      createFromApply: jest.fn().mockResolvedValue(applicationResult),
      findParsedProfileByApplicationId: jest.fn().mockResolvedValue(parsedProfile),
      recordCvContentSimilarityCheck: jest.fn(),
    };
    const controller = Object.create(PublicJobPostingsController.prototype) as any;
    controller.applicationsService = applicationsService;
    controller.cvDocumentsService = cvDocumentsService;
    controller.cvParsingService = cvParsingService;
    controller.cvSimilarityService = similarityService;
    controller.fileParserService = {
      parseFile: jest.fn().mockResolvedValue({
        rawText: 'Candidate candidate@example.com Python built ETL pipelines '.repeat(8),
      }),
    };
    controller.formSessionsService = {
      generateFormSession: jest.fn().mockResolvedValue({}),
    };
    controller.jobPostingsService = {};

    return {
      controller,
      similarityService,
      cvDocumentsService,
      cvParsingService,
      applicationsService,
      dto: {
        fullName: 'Candidate',
        email: 'candidate@example.com',
        phone: '0123456789',
      },
      file: { path: 'cv.pdf' },
      request: { headers: {}, ip: '127.0.0.1', socket: { remoteAddress: null } },
    };
  }

  it('rejects same candidate and same job at or above 0.95 before CV upload', async () => {
    const fixture = createApplyFixture({
      duplicate: true,
      duplicateReason: 'CANDIDATE_JOB_MATCH',
      score: 0.95,
    });

    await expect(
      fixture.controller.apply(
        'job-1',
        fixture.dto,
        fixture.file,
        fixture.request,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DUPLICATE_CV_CONTENT' }),
    });
    expect(fixture.similarityService.compare).toHaveBeenCalled();
    expect(fixture.cvDocumentsService.uploadOriginalCv).not.toHaveBeenCalled();
    expect(fixture.cvParsingService.parseCleanCvDocument).not.toHaveBeenCalled();
  });

  it('continues normal upload and AI parsing below 0.95', async () => {
    const fixture = createApplyFixture({
      duplicate: true,
      duplicateReason: 'CANDIDATE_JOB_MATCH',
      score: 0.949999,
    });

    await fixture.controller.apply(
      'job-1',
      fixture.dto,
      fixture.file,
      fixture.request,
    );

    expect(fixture.similarityService.compare).toHaveBeenCalled();
    expect(fixture.cvDocumentsService.uploadOriginalCv).toHaveBeenCalled();
    expect(fixture.cvDocumentsService.sanitizeOriginalCvAfterScanPass).toHaveBeenCalled();
    expect(fixture.cvParsingService.parseCleanCvDocument).toHaveBeenCalled();
  });

  it('does not compare a first application', async () => {
    const fixture = createApplyFixture({ duplicate: false });

    await fixture.controller.apply(
      'job-1',
      fixture.dto,
      fixture.file,
      fixture.request,
    );

    expect(fixture.similarityService.compare).not.toHaveBeenCalled();
    expect(fixture.cvDocumentsService.uploadOriginalCv).toHaveBeenCalled();
  });

  it('does not run similarity twice for an idempotent replay', async () => {
    const fixture = createApplyFixture({
      duplicate: true,
      duplicateReason: 'IDEMPOTENT_REPLAY',
    });

    await fixture.controller.apply(
      'job-1',
      fixture.dto,
      fixture.file,
      fixture.request,
      'same-request-key',
    );

    expect(fixture.similarityService.compare).not.toHaveBeenCalled();
    expect(fixture.cvDocumentsService.uploadOriginalCv).toHaveBeenCalled();
  });
});
