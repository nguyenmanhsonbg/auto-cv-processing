import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix migration: Uses raw SQL with IF NOT EXISTS for idempotency.
 * Seeds existing migrations, creates recruitment pipeline tables/columns,
 * marks itself as completed.
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

    // 2. Seed existing migrations
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
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_applications_current_stage" ON "applications" ("current_stage")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_applications_hired_at" ON "applications" ("hired_at")`);

    // 4. Create interview_rounds table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "interview_rounds" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "round_type" varchar NOT NULL,
        "interviewer_ids" uuid[] NULL,
        "external_interviewer_ids" jsonb NULL,
        "scheduled_at" timestamptz NULL,
        "started_at" timestamptz NULL,
        "completed_at" timestamptz NULL,
        "result" varchar NULL,
        "overall_grade" varchar NULL,
        "scores" jsonb NULL,
        "summary" text NULL,
        "external_round_id" varchar NULL,
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_interview_rounds_application" ON "interview_rounds" ("application_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_interview_rounds_round_type" ON "interview_rounds" ("round_type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_interview_rounds_result" ON "interview_rounds" ("result")`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_interview_rounds_application'
        ) THEN
          ALTER TABLE "interview_rounds" ADD CONSTRAINT "FK_interview_rounds_application"
          FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT;
        END IF;
      END$$;
    `);

    // 5. Create test_rounds table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "test_rounds" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "round_type" varchar NOT NULL,
        "test_type" varchar NULL,
        "assigned_at" timestamptz NULL,
        "deadline_at" timestamptz NULL,
        "submitted_at" timestamptz NULL,
        "evaluated_at" timestamptz NULL,
        "result" varchar NULL,
        "score" decimal(5,2) NULL,
        "passing_score" decimal(5,2) NULL,
        "comment" text NULL,
        "external_test_id" varchar NULL,
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_test_rounds_application" ON "test_rounds" ("application_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_test_rounds_round_type" ON "test_rounds" ("round_type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_test_rounds_result" ON "test_rounds" ("result")`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_test_rounds_application'
        ) THEN
          ALTER TABLE "test_rounds" ADD CONSTRAINT "FK_test_rounds_application"
          FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT;
        END IF;
      END$$;
    `);

    // 6. Create offers table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "offers" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "version" integer DEFAULT 1,
        "previous_offer_id" uuid NULL,
        "status" varchar NOT NULL,
        "job_title" varchar NOT NULL,
        "department" varchar NULL,
        "level" varchar NULL,
        "gross_salary" decimal(12,2) NULL,
        "start_date" date NULL,
        "contract_type" varchar NULL,
        "work_location" varchar NULL,
        "benefits" jsonb NULL,
        "notes" text NULL,
        "sent_at" timestamptz NULL,
        "responded_at" timestamptz NULL,
        "expires_at" timestamptz NULL,
        "hr_created_by_id" uuid NOT NULL,
        "external_offer_id" varchar NULL,
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_offers_application" ON "offers" ("application_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_offers_status" ON "offers" ("status")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_offers_application_version" ON "offers" ("application_id", "version")`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_offers_application'
        ) THEN
          ALTER TABLE "offers" ADD CONSTRAINT "FK_offers_application"
          FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT;
        END IF;
      END$$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_offers_previous_offer'
        ) THEN
          ALTER TABLE "offers" ADD CONSTRAINT "FK_offers_previous_offer"
          FOREIGN KEY ("previous_offer_id") REFERENCES "offers"("id") ON DELETE SET NULL;
        END IF;
      END$$;
    `);

    // 7. Add FK for assigned_recruiter_id
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_applications_assigned_recruiter'
        ) THEN
          ALTER TABLE "applications" ADD CONSTRAINT "FK_applications_assigned_recruiter"
          FOREIGN KEY ("assigned_recruiter_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
      END$$;
    `);

    // 8. Mark migrations as completed
    await queryRunner.query(
      `INSERT INTO migrations (timestamp, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [1785999999999, 'FixRecruitmentPipelineSetup1785999999999']
    );
    await queryRunner.query(
      `INSERT INTO migrations (timestamp, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [1785500000000, 'AddRecruitmentPipelineTables1700000000000']
    );

    // 9. Backfill current_stage
    await queryRunner.query(`
      UPDATE "applications"
      SET
        "current_stage" = 'HIRED',
        "hired_at" = COALESCE("hired_at", "updated_at")
      WHERE
        ("hr_review_status" = 'APPROVE' OR "hired_at" IS NOT NULL)
        AND "current_stage" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "applications"
      SET "current_stage" = 'TALENT_POOL'
      WHERE
        "hr_review_status" = 'TALENT_POOL'
        AND "current_stage" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "applications"
      SET "current_stage" = 'REJECTED'
      WHERE
        ("status" = 'HR_REJECTED' OR "hr_review_status" = 'REJECT')
        AND "current_stage" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "applications"
      SET "current_stage" = 'SCREEN_CV'
      WHERE
        ("status" = 'AI_SCREENING_DONE' OR "status" = 'WAITING_HR_REVIEW' OR "form_status" = 'SUBMITTED')
        AND "current_stage" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "applications" a
      SET "current_stage" = 'PRE_TEST_1'
      WHERE
        "form_status" = 'SENT'
        AND "current_stage" IS NULL
        AND EXISTS (
          SELECT 1 FROM "form_sessions" fs
          WHERE fs."application_id" = a."id"
          AND fs."expires_at" > NOW()
        )
    `);

    await queryRunner.query(`
      UPDATE "applications"
      SET "current_stage" = 'APPLIED'
      WHERE "current_stage" IS NULL
    `);

    const summary = await queryRunner.query(`
      SELECT "current_stage", COUNT(*) as count
      FROM "applications"
      WHERE "current_stage" IS NOT NULL
      GROUP BY "current_stage"
      ORDER BY count DESC
    `);
    console.log('Backfill Summary:', summary);

    console.log('✓ Recruitment pipeline setup completed successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "offers" DROP CONSTRAINT IF EXISTS "FK_offers_previous_offer"`);
    await queryRunner.query(`ALTER TABLE "offers" DROP CONSTRAINT IF EXISTS "FK_offers_application"`);
    await queryRunner.query(`ALTER TABLE "test_rounds" DROP CONSTRAINT IF EXISTS "FK_test_rounds_application"`);
    await queryRunner.query(`ALTER TABLE "interview_rounds" DROP CONSTRAINT IF EXISTS "FK_interview_rounds_application"`);
    await queryRunner.query(`ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "FK_applications_assigned_recruiter"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "offers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "test_rounds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "interview_rounds"`);
    await queryRunner.query(`ALTER TABLE "applications" DROP COLUMN IF EXISTS "current_stage", DROP COLUMN IF EXISTS "assigned_recruiter_id", DROP COLUMN IF EXISTS "hired_at", DROP COLUMN IF EXISTS "offer_status"`);
  }
}
