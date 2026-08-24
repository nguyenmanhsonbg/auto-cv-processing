import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

/**
 * Fix migration order issue:
 * - Creates migrations table if not exists
 * - Seeds all existing migrations
 * - Creates recruitment pipeline tables and columns
 * - Marks itself and AddRecruitmentPipelineTables as completed
 */
export class FixRecruitmentPipelineSetup1785999999999 implements MigrationInterface {
  name = 'FixRecruitmentPipelineSetup1785999999999';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create migrations table if not exists
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        timestamp bigint NOT NULL,
        name varchar(255) NOT NULL
      )
    `);

    // 2. Seed existing migrations (all except the two new ones)
    const existingMigrations = [
      [1743724800000, '1743724800000-RenameQuestionCategoryToBackend'],
      [1744893600000, '1744893600000-AddSlugToSession'],
      [1776308195039, '1776308195039-AddSchedulingFieldsToSession'],
      [1781943070523, '1781943070523-CreateRecruitmentPhase1Foundation'],
      [1781945070523, '1781945070523-AddRecruitmentPhase1Constraints'],
      [1782717683118, '1782717683118-CreateExtensionIntegrationReadiness'],
      [1782890000000, '1782890000000-CreateFacebookExtensionPublishing'],
      [1782950000000, '1782950000000-AddSummaryToJobDescriptions'],
      [1782951000000, '1782951000000-CreateAmisCareers'],
      [1782952000000, '1782952000000-AddAmisCareerQuestionMapping'],
      [1782970000000, '1782970000000-AddFacebookPublishTargetOwner'],
      [1782980000000, '1782980000000-AddFacebookTargetEligibilityAndQuota'],
      [1782980000000, '1782980000000-CreateAuthRefreshTokens'],
      [1782990000000, '1782990000000-AddFacebookPublishHistoryReviewStatus'],
      [1782990000000, '1782990000000-AddJobPostingFormQuestionIds'],
      [1783000000000, '1783000000000-AddVcsPortalJobDescriptionSync'],
      [1783000000000, '1783000000000-CreateExtensionInstancesAndTasks'],
      [1783100000000, '1783100000000-RefineJobDescriptionVcsPortalSchema'],
      [1783115000000, '1783115000000-AddFacebookTargetLastDiscoveredAt'],
      [1783150000000, '1783150000000-AddAmisCandidateIdToApplicationSources'],
      [1783200000000, '1783200000000-ChangeAnnualLeaveDaysToText'],
      [1783300000000, '1783300000000-AddJobPostingFormQuestionSetSnapshot'],
      [1783310000000, '1783310000000-AddAmisCandidateIdToApplicationSources'],
      [1783400000000, '1783400000000-CreateFacebookGroupSyncStates'],
      [1783400000000, '1783400000000-SeedVcsPortalSampleJobDescriptions'],
      [1783500000000, '1783500000000-AddFacebookAccountScope'],
      [1783600000000, '1783600000000-AddFacebookAccountAvatarUrl'],
      [1783700000000, '1783700000000-AddFacebookPublishQuotaReservations'],
      [1784764800000, '1784764800000-CreateFreelancersAndApplicationReferrals'],
      [1784851200000, '1784851200000-AddInternalsAndGenericApplicationReferrals'],
      [1784937600000, '1784937600000-AddFreelancerPhone'],
      [1785000000000, '1785000000000-AddFacebookPublishTargetManualInclusion'],
      [1785000000000, '1785000000000-CreateAmisHrStageReminderTables'],
      [1785100000000, '1785100000000-CreateAmisCandidateStageNotifications'],
      [1785200000000, '1785200000000-AddInternalUserAccounts'],
      [1785300000000, '1785300000000-CreatePasswordResetRequests'],
      [1785400000000, '1785400000000-AddFacebookPublishTargetDiscoveryExclusion'],
    ];

    for (const [timestamp, name] of existingMigrations) {
      await queryRunner.query(
        `INSERT INTO migrations (timestamp, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [timestamp, name]
      );
    }

    // 3. Add columns to applications
    await queryRunner.query(`
      ALTER TABLE "applications"
      ADD COLUMN IF NOT EXISTS "current_stage" VARCHAR NULL,
      ADD COLUMN IF NOT EXISTS "assigned_recruiter_id" UUID NULL,
      ADD COLUMN IF NOT EXISTS "hired_at" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "offer_status" VARCHAR NULL
    `);

    // Add indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_applications_current_stage"
      ON "applications" ("current_stage")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_applications_hired_at"
      ON "applications" ("hired_at")
    `);

    // 4. Create interview_rounds table
    await queryRunner.createTable(
      new Table({
        name: 'interview_rounds',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'application_id', type: 'uuid', isNullable: false },
          { name: 'round_type', type: 'varchar', isNullable: false },
          { name: 'interviewer_ids', type: 'uuid', isArray: true, isNullable: true },
          { name: 'external_interviewer_ids', type: 'jsonb', isNullable: true },
          { name: 'scheduled_at', type: 'timestamptz', isNullable: true },
          { name: 'started_at', type: 'timestamptz', isNullable: true },
          { name: 'completed_at', type: 'timestamptz', isNullable: true },
          { name: 'result', type: 'varchar', isNullable: true },
          { name: 'overall_grade', type: 'varchar', isNullable: true },
          { name: 'scores', type: 'jsonb', isNullable: true },
          { name: 'summary', type: 'text', isNullable: true },
          { name: 'external_round_id', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('interview_rounds', new TableIndex({ name: 'IDX_interview_rounds_application', columnNames: ['application_id'] }));
    await queryRunner.createIndex('interview_rounds', new TableIndex({ name: 'IDX_interview_rounds_round_type', columnNames: ['round_type'] }));
    await queryRunner.createIndex('interview_rounds', new TableIndex({ name: 'IDX_interview_rounds_result', columnNames: ['result'] }));
    await queryRunner.createForeignKey('interview_rounds', new TableForeignKey({
      name: 'FK_interview_rounds_application',
      columnNames: ['application_id'],
      referencedTableName: 'applications',
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    }));

    // 5. Create test_rounds table
    await queryRunner.createTable(
      new Table({
        name: 'test_rounds',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'application_id', type: 'uuid', isNullable: false },
          { name: 'round_type', type: 'varchar', isNullable: false },
          { name: 'test_type', type: 'varchar', isNullable: true },
          { name: 'assigned_at', type: 'timestamptz', isNullable: true },
          { name: 'deadline_at', type: 'timestamptz', isNullable: true },
          { name: 'submitted_at', type: 'timestamptz', isNullable: true },
          { name: 'evaluated_at', type: 'timestamptz', isNullable: true },
          { name: 'result', type: 'varchar', isNullable: true },
          { name: 'score', type: 'decimal', precision: 5, scale: 2, isNullable: true },
          { name: 'passing_score', type: 'decimal', precision: 5, scale: 2, isNullable: true },
          { name: 'comment', type: 'text', isNullable: true },
          { name: 'external_test_id', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('test_rounds', new TableIndex({ name: 'IDX_test_rounds_application', columnNames: ['application_id'] }));
    await queryRunner.createIndex('test_rounds', new TableIndex({ name: 'IDX_test_rounds_round_type', columnNames: ['round_type'] }));
    await queryRunner.createIndex('test_rounds', new TableIndex({ name: 'IDX_test_rounds_result', columnNames: ['result'] }));
    await queryRunner.createForeignKey('test_rounds', new TableForeignKey({
      name: 'FK_test_rounds_application',
      columnNames: ['application_id'],
      referencedTableName: 'applications',
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    }));

    // 6. Create offers table
    await queryRunner.createTable(
      new Table({
        name: 'offers',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'application_id', type: 'uuid', isNullable: false },
          { name: 'version', type: 'integer', default: 1 },
          { name: 'previous_offer_id', type: 'uuid', isNullable: true },
          { name: 'status', type: 'varchar', isNullable: false },
          { name: 'job_title', type: 'varchar', isNullable: false },
          { name: 'department', type: 'varchar', isNullable: true },
          { name: 'level', type: 'varchar', isNullable: true },
          { name: 'gross_salary', type: 'decimal', precision: 12, scale: 2, isNullable: true },
          { name: 'start_date', type: 'date', isNullable: true },
          { name: 'contract_type', type: 'varchar', isNullable: true },
          { name: 'work_location', type: 'varchar', isNullable: true },
          { name: 'benefits', type: 'jsonb', isNullable: true },
          { name: 'notes', type: 'text', isNullable: true },
          { name: 'sent_at', type: 'timestamptz', isNullable: true },
          { name: 'responded_at', type: 'timestamptz', isNullable: true },
          { name: 'expires_at', type: 'timestamptz', isNullable: true },
          { name: 'hr_created_by_id', type: 'uuid', isNullable: false },
          { name: 'external_offer_id', type: 'varchar', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('offers', new TableIndex({ name: 'IDX_offers_application', columnNames: ['application_id'] }));
    await queryRunner.createIndex('offers', new TableIndex({ name: 'IDX_offers_status', columnNames: ['status'] }));
    await queryRunner.createIndex('offers', new TableIndex({ name: 'UQ_offers_application_version', columnNames: ['application_id', 'version'], isUnique: true }));
    await queryRunner.createForeignKey('offers', new TableForeignKey({
      name: 'FK_offers_application',
      columnNames: ['application_id'],
      referencedTableName: 'applications',
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
    }));
    await queryRunner.createForeignKey('offers', new TableForeignKey({
      name: 'FK_offers_previous_offer',
      columnNames: ['previous_offer_id'],
      referencedTableName: 'offers',
      referencedColumnNames: ['id'],
      onDelete: 'SET NULL',
    }));

    // 7. Add foreign key for assigned_recruiter_id
    await queryRunner.createForeignKey('applications', new TableForeignKey({
      name: 'FK_applications_assigned_recruiter',
      columnNames: ['assigned_recruiter_id'],
      referencedTableName: 'users',
      referencedColumnNames: ['id'],
      onDelete: 'SET NULL',
    }));

    // 8. Mark new migrations as completed
    await queryRunner.query(
      `INSERT INTO migrations (timestamp, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [1785999999999, 'FixRecruitmentPipelineSetup1785999999999']
    );
    await queryRunner.query(
      `INSERT INTO migrations (timestamp, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [1785500000000, 'AddRecruitmentPipelineTables1700000000000']
    );
    await queryRunner.query(
      `INSERT INTO migrations (timestamp, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [1785700000000, 'BackfillRecruitmentPipelineStages1700000000000']
    );

    console.log('✓ Recruitment pipeline setup completed successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse order
    await queryRunner.dropForeignKey('applications', 'FK_applications_assigned_recruiter');
    await queryRunner.dropForeignKey('offers', 'FK_offers_previous_offer');
    await queryRunner.dropForeignKey('offers', 'FK_offers_application');
    await queryRunner.dropForeignKey('test_rounds', 'FK_test_rounds_application');
    await queryRunner.dropForeignKey('interview_rounds', 'FK_interview_rounds_application');
    await queryRunner.dropTable('offers');
    await queryRunner.dropTable('test_rounds');
    await queryRunner.dropTable('interview_rounds');
    await queryRunner.query(`ALTER TABLE "applications" DROP COLUMN IF EXISTS "current_stage", DROP COLUMN IF EXISTS "assigned_recruiter_id", DROP COLUMN IF EXISTS "hired_at", DROP COLUMN IF EXISTS "offer_status"`);
  }
}
