import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class AddRecruitmentPipelineTables1700000000000 implements MigrationInterface {
  name = 'AddRecruitmentPipelineTables1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========================================
    // 1. ALTER TABLE applications - add new columns
    // ========================================
    await queryRunner.query(`
      ALTER TABLE "applications" 
      ADD COLUMN IF NOT EXISTS "current_stage" VARCHAR NULL,
      ADD COLUMN IF NOT EXISTS "assigned_recruiter_id" UUID NULL,
      ADD COLUMN IF NOT EXISTS "hired_at" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "offer_status" VARCHAR NULL
    `);

    // Add index for faster queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_applications_current_stage" 
      ON "applications" ("current_stage")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_applications_hired_at" 
      ON "applications" ("hired_at")
    `);

    // ========================================
    // 2. CREATE TABLE interview_rounds
    // ========================================
    await queryRunner.createTable(
      new Table({
        name: 'interview_rounds',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'application_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'round_type',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'interviewer_ids',
            type: 'uuid',
            isArray: true,
            isNullable: true,
          },
          {
            name: 'external_interviewer_ids',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'scheduled_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'started_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'completed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'result',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'overall_grade',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'scores',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'summary',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'external_round_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create indexes for interview_rounds
    await queryRunner.createIndex(
      'interview_rounds',
      new TableIndex({
        name: 'IDX_interview_rounds_application',
        columnNames: ['application_id'],
      }),
    );

    await queryRunner.createIndex(
      'interview_rounds',
      new TableIndex({
        name: 'IDX_interview_rounds_round_type',
        columnNames: ['round_type'],
      }),
    );

    await queryRunner.createIndex(
      'interview_rounds',
      new TableIndex({
        name: 'IDX_interview_rounds_result',
        columnNames: ['result'],
      }),
    );

    // Create foreign key
    await queryRunner.createForeignKey(
      'interview_rounds',
      new TableForeignKey({
        name: 'FK_interview_rounds_application',
        columnNames: ['application_id'],
        referencedTableName: 'applications',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );

    // ========================================
    // 3. CREATE TABLE test_rounds
    // ========================================
    await queryRunner.createTable(
      new Table({
        name: 'test_rounds',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'application_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'round_type',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'test_type',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'assigned_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'deadline_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'submitted_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'evaluated_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'result',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'score',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'passing_score',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'comment',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'external_test_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create indexes for test_rounds
    await queryRunner.createIndex(
      'test_rounds',
      new TableIndex({
        name: 'IDX_test_rounds_application',
        columnNames: ['application_id'],
      }),
    );

    await queryRunner.createIndex(
      'test_rounds',
      new TableIndex({
        name: 'IDX_test_rounds_round_type',
        columnNames: ['round_type'],
      }),
    );

    await queryRunner.createIndex(
      'test_rounds',
      new TableIndex({
        name: 'IDX_test_rounds_result',
        columnNames: ['result'],
      }),
    );

    // Create foreign key
    await queryRunner.createForeignKey(
      'test_rounds',
      new TableForeignKey({
        name: 'FK_test_rounds_application',
        columnNames: ['application_id'],
        referencedTableName: 'applications',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );

    // ========================================
    // 4. CREATE TABLE offers
    // ========================================
    await queryRunner.createTable(
      new Table({
        name: 'offers',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'application_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'version',
            type: 'integer',
            default: 1,
          },
          {
            name: 'previous_offer_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'job_title',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'department',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'level',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'gross_salary',
            type: 'decimal',
            precision: 12,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'start_date',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'contract_type',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'work_location',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'benefits',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'sent_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'responded_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'expires_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'hr_created_by_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'external_offer_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create indexes for offers
    await queryRunner.createIndex(
      'offers',
      new TableIndex({
        name: 'IDX_offers_application',
        columnNames: ['application_id'],
      }),
    );

    await queryRunner.createIndex(
      'offers',
      new TableIndex({
        name: 'IDX_offers_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'offers',
      new TableIndex({
        name: 'UQ_offers_application_version',
        columnNames: ['application_id', 'version'],
        isUnique: true,
      }),
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'offers',
      new TableForeignKey({
        name: 'FK_offers_application',
        columnNames: ['application_id'],
        referencedTableName: 'applications',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createForeignKey(
      'offers',
      new TableForeignKey({
        name: 'FK_offers_previous_offer',
        columnNames: ['previous_offer_id'],
        referencedTableName: 'offers',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    // ========================================
    // 5. Add foreign key for assigned_recruiter_id
    // ========================================
    await queryRunner.createForeignKey(
      'applications',
      new TableForeignKey({
        name: 'FK_applications_assigned_recruiter',
        columnNames: ['assigned_recruiter_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.dropForeignKey('applications', 'FK_applications_assigned_recruiter');
    await queryRunner.dropForeignKey('interview_rounds', 'FK_interview_rounds_application');
    await queryRunner.dropForeignKey('test_rounds', 'FK_test_rounds_application');
    await queryRunner.dropForeignKey('offers', 'FK_offers_application');
    await queryRunner.dropForeignKey('offers', 'FK_offers_previous_offer');

    // Drop tables
    await queryRunner.dropTable('offers');
    await queryRunner.dropTable('test_rounds');
    await queryRunner.dropTable('interview_rounds');

    // Drop columns from applications
    await queryRunner.query(`
      ALTER TABLE "applications" 
      DROP COLUMN IF EXISTS "current_stage",
      DROP COLUMN IF EXISTS "assigned_recruiter_id",
      DROP COLUMN IF EXISTS "hired_at",
      DROP COLUMN IF EXISTS "offer_status"
    `);
  }
}
