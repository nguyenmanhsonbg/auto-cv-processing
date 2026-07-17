import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { DuplicateCheckEntity } from './entities/duplicate-check.entity';
import { ApplicationsService } from './applications.service';
import { DuplicateCheckStatus, DuplicateCheckType } from '../recruitment-common';
import { ApplicationEntity } from './entities/application.entity';
import { ApplicationStatus } from '../recruitment-common';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('ApplicationsService CV content similarity recording', () => {
  it('persists an auditable duplicate-check result with the application scope', async () => {
    const duplicateCheckSave = jest.fn().mockResolvedValue({});
    const auditLogSave = jest.fn().mockResolvedValue({});
    const application = { status: ApplicationStatus.APPLICATION_CREATED };
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === ApplicationEntity) {
          return {
            findOne: jest.fn().mockResolvedValue(application),
          };
        }
        if (entity === DuplicateCheckEntity) {
          return {
            create: (value: unknown) => value,
            save: duplicateCheckSave,
          };
        }
        if (entity === AuditLogEntity) {
          return {
            create: (value: unknown) => value,
            save: auditLogSave,
          };
        }
        throw new Error('Unexpected repository');
      },
    };
    const service = Object.create(ApplicationsService.prototype) as ApplicationsService;
    (service as any).dataSource = {
      transaction: (callback: (value: unknown) => unknown) => callback(manager),
    };
    (service as any).workflowStateService = {
      recordEvent: jest.fn(),
    };

    await service.recordCvContentSimilarityCheck({
      applicationId: 'application-1',
      candidateId: 'candidate-1',
      jobPostingId: 'job-1',
      previousParsedProfileId: 'profile-1',
      previousCvDocumentId: 'cv-document-1',
      oldNormalizedTextHash: 'old-hash',
      newNormalizedTextHash: 'new-hash',
      score: 0.95,
      threshold: 0.95,
      methodVersion: 'TFIDF_WORD_NGRAM_V1',
      decision: 'DUPLICATE_FOUND',
    });

    expect(duplicateCheckSave).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: 'application-1',
      checkType: DuplicateCheckType.CV_CONTENT_SIMILARITY,
      status: DuplicateCheckStatus.DUPLICATE_FOUND,
      matchedEntityType: 'CV_DOCUMENT',
      matchedEntityId: 'cv-document-1',
      score: '0.950000',
    }));
    expect(duplicateCheckSave.mock.calls[0][0].details).toEqual(expect.objectContaining({
      candidateId: 'candidate-1',
      jobPostingId: 'job-1',
      previousParsedProfileId: 'profile-1',
      oldNormalizedTextHash: 'old-hash',
      newNormalizedTextHash: 'new-hash',
      threshold: 0.95,
      methodVersion: 'TFIDF_WORD_NGRAM_V1',
      decision: 'DUPLICATE_FOUND',
    }));
  });
});
