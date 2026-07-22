import { CvDocumentsService } from './cv-documents.service';
import { CvDocumentEntity } from './entities/cv-document.entity';
import { ParsedProfileEntity } from './entities/parsed-profile.entity';
import { StorageZone } from '../recruitment-common';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('CvDocumentsService clean CV text fallback', () => {
  it('extracts raw text from the current clean CV with the local parser', async () => {
    const parseFile = jest.fn().mockResolvedValue({
      rawText: 'Current clean CV text',
    });
    const service = Object.create(CvDocumentsService.prototype) as CvDocumentsService;
    (service as any).fileParserService = { parseFile };

    const cvDocument = {
      storagePath: 'safe/current-cv.pdf',
    } as CvDocumentEntity;

    await expect(service.extractCleanCvText(cvDocument)).resolves.toBe('Current clean CV text');
    expect(parseFile).toHaveBeenCalledWith(expect.stringContaining('current-cv.pdf'));
  });
});

describe('CvDocumentsService public reapply file handling', () => {
  it('skips the prior original hash lookup when similarity already passed', async () => {
    const findOne = jest.fn();
    const service = Object.create(CvDocumentsService.prototype) as CvDocumentsService;
    const manager = {
      getRepository: () => ({ findOne }),
    };

    expect(
      (service as any).findExistingOriginalByHash(
        manager,
        'application-1',
        'same-file-hash',
        true,
      ),
    ).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('deletes previous CV documents and parsed profiles while keeping the new version', async () => {
    const previousDocument = {
      id: 'old-cv-1',
      applicationId: 'application-1',
      storageZone: StorageZone.QUARANTINE,
      storagePath: 'quarantine/old-cv.pdf',
    };
    const currentDocument = {
      id: 'new-cv-1',
      applicationId: 'application-1',
      storageZone: StorageZone.SAFE,
      storagePath: 'safe/new-cv.pdf',
    };
    const parsedProfileRepo = { delete: jest.fn().mockResolvedValue({}) };
    const cvDocumentRepo = {
      find: jest.fn().mockResolvedValue([previousDocument, currentDocument]),
      delete: jest.fn().mockResolvedValue({}),
    };
    const manager = {
      getRepository: (entity: unknown) => entity === ParsedProfileEntity
        ? parsedProfileRepo
        : cvDocumentRepo,
    };
    const service = Object.create(CvDocumentsService.prototype) as CvDocumentsService;
    (service as any).dataSource = {
      transaction: jest.fn(async (callback: (value: unknown) => Promise<unknown>) => callback(manager)),
    };
    (service as any).deleteStoredCvDocument = jest.fn();

    await (service as any).deletePreviousCvVersions({
      applicationId: 'application-1',
      keepCvDocumentIds: ['new-cv-1'],
    });

    expect(parsedProfileRepo.delete).toHaveBeenCalled();
    expect(cvDocumentRepo.delete).toHaveBeenCalledWith(['old-cv-1']);
    expect((service as any).deleteStoredCvDocument).toHaveBeenCalledWith(previousDocument);
  });
});
