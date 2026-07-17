import { ApplicationEntity } from '../applications/entities/application.entity';
import { DuplicateCheckEntity } from '../applications/entities/duplicate-check.entity';
import { ParsedProfileEntity } from '../cv-documents/entities/parsed-profile.entity';
import {
  ApplicationStatus,
  CvDocumentType,
  DuplicateCheckStatus,
  DuplicateCheckType,
} from '../recruitment-common';
import { CvParsingService } from './cv-parsing.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('CvParsingService parsed profile duplicate scope', () => {
  function createServiceAndManager(previousProfiles: Array<{
    id: string;
    applicationId: string;
    normalizedTextHash: string;
    candidateId: string;
  }>) {
    const duplicateCheckSave = jest.fn().mockResolvedValue({});
    const workflowStateService = {
      recordStatusTransition: jest.fn(),
      recordEvent: jest.fn(),
    };
    const queryState = {
      scopedToApplication: false,
      params: {} as Record<string, string>,
    };
    const queryBuilder: any = {
      where: jest.fn((condition: string, params: Record<string, string>) => {
        Object.assign(queryState.params, params);
        return queryBuilder;
      }),
      andWhere: jest.fn((condition: string, params: Record<string, string>) => {
        if (condition.includes('applicationId')) queryState.scopedToApplication = true;
        Object.assign(queryState.params, params);
        return queryBuilder;
      }),
      orderBy: jest.fn(() => queryBuilder),
      getOne: jest.fn(async () => previousProfiles.find((profile) => (
        profile.normalizedTextHash === queryState.params.normalizedTextHash
        && profile.id !== queryState.params.parsedProfileId
        && (!queryState.scopedToApplication
          || profile.applicationId === queryState.params.applicationId)
      )) ?? null),
    };
    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === ParsedProfileEntity) {
          return { createQueryBuilder: jest.fn(() => queryBuilder) };
        }
        if (entity === DuplicateCheckEntity) {
          return {
            create: (value: unknown) => value,
            save: duplicateCheckSave,
          };
        }
        if (entity === ApplicationEntity) {
          return {
            findOne: jest.fn().mockResolvedValue({ status: ApplicationStatus.CV_PARSED }),
          };
        }
        throw new Error(`Unexpected repository ${String(entity)}`);
      },
    };
    const service = Object.create(CvParsingService.prototype) as CvParsingService;
    (service as any).workflowStateService = workflowStateService;

    return { service, manager, duplicateCheckSave, queryBuilder };
  }

  it('does not match the same hash from another application', async () => {
    const fixture = createServiceAndManager([
      {
        id: 'profile-other',
        applicationId: 'application-other',
        normalizedTextHash: 'same-hash',
        candidateId: 'candidate-other',
      },
    ]);

    await (fixture.service as any).recordProfileDuplicateCheck(
      fixture.manager,
      {
        id: 'profile-current',
        applicationId: 'application-current',
        candidateId: 'candidate-current',
        normalizedTextHash: 'same-hash',
      },
    );

    expect(fixture.queryBuilder.andWhere).toHaveBeenCalledWith(
      'parsedProfile.applicationId = :applicationId',
      { applicationId: 'application-current' },
    );
    expect(fixture.duplicateCheckSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      checkType: DuplicateCheckType.PARSED_PROFILE,
      status: DuplicateCheckStatus.PASSED,
      matchedEntityId: null,
    }));
  });

  it('still matches the same hash from another profile in the same application', async () => {
    const fixture = createServiceAndManager([
      {
        id: 'profile-same',
        applicationId: 'application-current',
        normalizedTextHash: 'same-hash',
        candidateId: 'candidate-current',
      },
    ]);

    await (fixture.service as any).recordProfileDuplicateCheck(
      fixture.manager,
      {
        id: 'profile-current',
        applicationId: 'application-current',
        candidateId: 'candidate-current',
        normalizedTextHash: 'same-hash',
      },
    );

    expect(fixture.duplicateCheckSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      status: DuplicateCheckStatus.NEEDS_REVIEW,
      matchedEntityId: 'profile-same',
    }));
  });
});
