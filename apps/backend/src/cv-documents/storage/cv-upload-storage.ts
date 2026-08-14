import { diskStorage } from 'multer';
import {
  buildCvQuarantineFileName,
  ensureCvQuarantineRoot,
} from './cv-quarantine-storage';

export const CV_UPLOAD_SIZE_LIMIT_BYTES = 20 * 1024 * 1024;

export function createCvQuarantineStorage() {
  return diskStorage({
    destination: (_req, _file, cb) => {
      try {
        cb(null, ensureCvQuarantineRoot());
      } catch (error) {
        cb(error instanceof Error ? error : new Error('CV quarantine storage is invalid'), '');
      }
    },
    filename: (_req, file, cb) => {
      cb(null, buildCvQuarantineFileName(file.originalname));
    },
  });
}
