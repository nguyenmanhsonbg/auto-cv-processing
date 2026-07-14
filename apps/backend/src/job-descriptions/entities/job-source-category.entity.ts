import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JobDescriptionEntity } from './job-description.entity';

@Entity('job_source_categories')
@Index('IDX_job_source_categories_source_name', ['sourceSystem', 'name'])
@Index('UQ_job_source_categories_source_category_id', ['sourceSystem', 'sourceCategoryId'], {
  unique: true,
  where: '"source_category_id" IS NOT NULL',
})
export class JobSourceCategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_system', type: 'varchar' })
  sourceSystem: string;

  @Column({ name: 'source_category_id', type: 'varchar', nullable: true })
  sourceCategoryId: string | null;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'display_name', type: 'varchar' })
  displayName: string;

  @Column({ type: 'varchar' })
  slug: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ManyToMany(() => JobDescriptionEntity, (jobDescription) => jobDescription.sourceCategories)
  jobDescriptions: JobDescriptionEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
