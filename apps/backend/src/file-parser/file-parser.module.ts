import { Module } from '@nestjs/common';
import { FileParserService } from './file-parser.service';

@Module({
  providers: [FileParserService],
  exports: [FileParserService],
})
export class FileParserModule {}
