import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { CandidateEntity } from '../../candidates/entities/candidate.entity';
import { CvDocumentEntity } from './cv-document.entity';

@Entity('parsed_profiles')
@Index('IDX_parsed_profiles_application', ['applicationId'])
@Index('IDX_parsed_profiles_cv_document', ['cvDocumentId'])
@Index('IDX_parsed_profiles_text_hash', ['normalizedTextHash'], {
  where: '"normalized_text_hash" IS NOT NULL',
})
export class ParsedProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, (application) => application.parsedProfiles, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ name: 'cv_document_id', type: 'uuid' })
  cvDocumentId: string;

  @ManyToOne(() => CvDocumentEntity, (cvDocument) => cvDocument.parsedProfiles, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'cv_document_id' })
  cvDocument: CvDocumentEntity;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => CandidateEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'candidate_id' })
  candidate: CandidateEntity;

  @Column({ name: 'parsed_data', type: 'jsonb' })
  parsedData: Record<string, unknown>;

  @Column({ name: 'normalized_text_hash', type: 'varchar', nullable: true })
  normalizedTextHash: string | null;

  @Column({ name: 'parser_version', type: 'varchar', nullable: true })
  parserVersion: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
