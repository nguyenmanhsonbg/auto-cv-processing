import { ConflictException } from '@nestjs/common';
import { PublicJobPostingsController } from './public-job-postings.controller';
import { ApplicationStatus } from '../recruitment-common';

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

  it('allows similarity lookup when name, email, and phone identify the same candidate', () => {
    const controller = Object.create(PublicJobPostingsController.prototype) as any;

    expect(() => controller.assertPublicReapplyBelongsToSameCandidate(
      {
        application: {
          candidate: {
            name: 'Candidate Name From Form',
            email: 'candidate@example.com',
            phone: '0337314321',
          },
        },
        candidate: {
          name: 'Candidate Name From Form',
          email: 'candidate@example.com',
          phone: '0337314321',
        },
      },
      {
        name: 'Candidate Name From Form',
        email: 'candidate@example.com',
        phone: '0337314321',
      },
    )).not.toThrow();
  });

  function createApplyFixture(options: {
    duplicate: boolean;
    duplicateReason?: 'CANDIDATE_JOB_MATCH' | 'IDEMPOTENT_REPLAY';
    score?: number;
    completedIdempotentReplay?: boolean;
  }) {
    const similarityService = {
      normalizeForSimilarity: jest.fn().mockReturnValue('normalized-uploaded-cv'),
      compare: jest.fn().mockReturnValue({
        score: options.score ?? 0.95,
        isDuplicate: (options.score ?? 0.95) >= 0.95,
        threshold: 0.95,
        methodVersion: 'TFIDF_WORD_CHAR_SECTION_V3',
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
      deletePreviousCvVersions: jest.fn(),
      extractCleanCvText: jest.fn(),
      findOriginalCvByIdempotencyKey: jest.fn().mockResolvedValue(
        options.completedIdempotentReplay
          ?? options.duplicateReason === 'IDEMPOTENT_REPLAY'
          ? { id: 'original-cv-1' }
          : null,
      ),
      extractSanitizedCvTextForSimilarity: jest.fn().mockResolvedValue(
        'Candidate candidate@example.com Python built ETL pipelines '.repeat(8),
      ),
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

  it('returns bounded similarity diagnostics when duplicate CV content is rejected', async () => {
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
      response: expect.objectContaining({
        code: 'DUPLICATE_CV_CONTENT',
        details: [
          expect.objectContaining({
            similarity: expect.objectContaining({
              score: 0.95,
              threshold: 0.95,
              decision: 'DUPLICATE_FOUND',
              methodVersion: 'TFIDF_WORD_CHAR_SECTION_V3',
              oldTextPreview: expect.any(String),
              newTextPreview: expect.any(String),
            }),
          }),
        ],
      }),
    });
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
    expect(fixture.cvDocumentsService.uploadOriginalCv).toHaveBeenCalledWith(
      expect.objectContaining({ skipExistingOriginalHashCheck: true }),
    );
    expect(fixture.cvDocumentsService.sanitizeOriginalCvAfterScanPass).toHaveBeenCalled();
    expect(fixture.cvParsingService.parseCleanCvDocument).toHaveBeenCalled();
    expect(fixture.cvDocumentsService.deletePreviousCvVersions).toHaveBeenCalledWith({
      applicationId: 'application-1',
      keepCvDocumentIds: ['original-cv-1', 'clean-cv-1'],
    });
  });

  it('allows a public CV reapply after the form session has been sent', async () => {
    const fixture = createApplyFixture({
      duplicate: true,
      duplicateReason: 'CANDIDATE_JOB_MATCH',
      score: 0.72,
    });

    await fixture.controller.apply(
      'job-1',
      fixture.dto,
      fixture.file,
      fixture.request,
    );

    expect(fixture.cvDocumentsService.uploadOriginalCv).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedApplicationStatuses: expect.arrayContaining([ApplicationStatus.FORM_SENT]),
      }),
    );
  });

  it('returns passed similarity diagnostics after a successful reapply', async () => {
    const fixture = createApplyFixture({
      duplicate: true,
      duplicateReason: 'CANDIDATE_JOB_MATCH',
      score: 0.72,
    });

    const response = await fixture.controller.apply(
      'job-1',
      fixture.dto,
      fixture.file,
      fixture.request,
    );

    expect(response.data.similarity).toEqual(expect.objectContaining({
      score: 0.72,
      threshold: 0.95,
      decision: 'PASSED',
      methodVersion: 'TFIDF_WORD_CHAR_SECTION_V3',
      oldTextPreview: expect.any(String),
      newTextPreview: expect.any(String),
    }));
  });

  it('preserves similarity diagnostics when an already-uploaded file is rejected afterward', async () => {
    const fixture = createApplyFixture({
      duplicate: true,
      duplicateReason: 'CANDIDATE_JOB_MATCH',
      score: 0.72,
    });
    fixture.cvDocumentsService.uploadOriginalCv.mockRejectedValueOnce(
      new ConflictException({
        code: 'DUPLICATE_CV_FILE',
        message: 'This CV file has already been uploaded for this application.',
      }),
    );

    await expect(
      fixture.controller.apply(
        'job-1',
        fixture.dto,
        fixture.file,
        fixture.request,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DUPLICATE_CV_FILE',
        details: [
          expect.objectContaining({
            similarity: expect.objectContaining({
              score: 0.72,
              decision: 'PASSED',
            }),
          }),
        ],
      }),
    });
  });

  it('returns a baseline similarity result for a first application', async () => {
    const fixture = createApplyFixture({ duplicate: false });

    const response = await fixture.controller.apply(
      'job-1',
      fixture.dto,
      fixture.file,
      fixture.request,
    );

    expect(fixture.similarityService.compare).not.toHaveBeenCalled();
    expect(response.data.similarity).toEqual(expect.objectContaining({
      score: 0,
      decision: 'PASSED',
      methodVersion: 'NO_PREVIOUS_CV_BASELINE_V1',
    }));
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

  it('rechecks similarity when the previous request with the same key did not complete', async () => {
    const fixture = createApplyFixture({
      duplicate: true,
      duplicateReason: 'IDEMPOTENT_REPLAY',
      score: 0.95,
      completedIdempotentReplay: false,
    });

    await expect(
      fixture.controller.apply(
        'job-1',
        fixture.dto,
        fixture.file,
        fixture.request,
        'same-request-key',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DUPLICATE_CV_CONTENT' }),
    });
    expect(fixture.similarityService.compare).toHaveBeenCalled();
    expect(fixture.cvDocumentsService.uploadOriginalCv).not.toHaveBeenCalled();
  });
});
