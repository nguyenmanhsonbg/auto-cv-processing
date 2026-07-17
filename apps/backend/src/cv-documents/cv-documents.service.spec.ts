import { CvDocumentsService } from './cv-documents.service';
import { CvDocumentEntity } from './entities/cv-document.entity';

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
