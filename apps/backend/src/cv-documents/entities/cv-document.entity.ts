import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  CvDocumentType,
  CvParseStatus,
  CvSanitizeStatus,
  CvScanStatus,
  StorageZone,
} from '../../recruitment-common';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { CandidateEntity } from '../../candidates/entities/candidate.entity';
import { ParsedProfileEntity } from './parsed-profile.entity';

@Entity('cv_documents')
@Index('IDX_cv_documents_application', ['applicationId'])
@Index('IDX_cv_documents_candidate', ['candidateId'])
@Index('IDX_cv_documents_original_hash', ['originalFileHash'], {
  where: '"original_file_hash" IS NOT NULL',
})
@Index('IDX_cv_documents_clean_hash', ['cleanFileHash'], {
  where: '"clean_file_hash" IS NOT NULL',
})
@Index('UQ_cv_documents_version', ['applicationId', 'versionNo', 'documentType'], {
  unique: true,
})
@Index('IDX_cv_documents_current', ['applicationId'], {
  where: '"is_current" = true',
})
export class CvDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, (application) => application.cvDocuments, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => CandidateEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'candidate_id' })
  candidate: CandidateEntity;

  @Column({ name: 'document_type', type: 'varchar' })
  documentType: CvDocumentType;

  @Column({ name: 'version_no', type: 'integer' })
  versionNo: number;

  @Column({ name: 'original_file_name', type: 'varchar' })
  originalFileName: string;

  @Column({ name: 'mime_type', type: 'varchar' })
  mimeType: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize: string;

  @Column({ name: 'original_file_hash', type: 'varchar', nullable: true })
  originalFileHash: string | null;

  @Column({ name: 'clean_file_hash', type: 'varchar', nullable: true })
  cleanFileHash: string | null;

  @Column({ name: 'storage_zone', type: 'varchar' })
  storageZone: StorageZone;

  @Column({ name: 'storage_path', type: 'text' })
  storagePath: string;

  @Column({
    name: 'scan_status',
    type: 'varchar',
    default: CvScanStatus.PENDING,
  })
  scanStatus: CvScanStatus;

  @Column({
    name: 'sanitize_status',
    type: 'varchar',
    default: CvSanitizeStatus.PENDING,
  })
  sanitizeStatus: CvSanitizeStatus;

  @Column({
    name: 'parse_status',
    type: 'varchar',
    default: CvParseStatus.PENDING,
  })
  parseStatus: CvParseStatus;

  @Column({ name: 'is_current', type: 'boolean', default: false })
  isCurrent: boolean;

  @OneToMany(() => ParsedProfileEntity, (parsedProfile) => parsedProfile.cvDocument)
  parsedProfiles: ParsedProfileEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
