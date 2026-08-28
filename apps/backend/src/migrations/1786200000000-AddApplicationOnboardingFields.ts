import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApplicationOnboardingFields1786200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "applications"
        ADD COLUMN IF NOT EXISTS "onboarding_status" VARCHAR NULL,
        ADD COLUMN IF NOT EXISTS "onboarding_confirmed_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "onboarding_confirmed_by_id" UUID NULL,
        ADD COLUMN IF NOT EXISTS "planned_onboard_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "onboarding_rejected_at" TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS "onboarding_rejected_reason" TEXT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_applications_onboarding_status"
      ON "applications" ("onboarding_status")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_applications_onboarding_confirmed_by'
        ) THEN
          ALTER TABLE "applications"
            ADD CONSTRAINT "FK_applications_onboarding_confirmed_by"
            FOREIGN KEY ("onboarding_confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      UPDATE "applications"
      SET "current_stage" = 'APPLIED'
      WHERE "current_stage" = 'PRE_TEST_1'
        AND NOT EXISTS (
          SELECT 1 FROM "test_rounds" tr
          WHERE tr."application_id" = "applications"."id"
            AND tr."round_type" = 'PRE_TEST_1'
        )
    `);
    await queryRunner.query(`
      UPDATE "applications"
      SET "current_stage" = 'APPLIED'
      WHERE "current_stage" = 'SCREEN_CV'
        AND COALESCE("ai_screening_status", '') <> 'DONE'
        AND NOT EXISTS (
          SELECT 1 FROM "mapping_results" mr
          WHERE mr."application_id" = "applications"."id"
            AND mr."status" = 'DONE'
        )
    `);
    await queryRunner.query(`
      UPDATE "applications"
      SET "current_stage" = 'ONBOARDING',
          "onboarding_status" = 'PENDING',
          "hired_at" = NULL
      WHERE "current_stage" = 'HIRED'
        AND "offer_status" = 'ACCEPTED'
        AND COALESCE("onboarding_status", '') <> 'COMPLETED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "FK_applications_onboarding_confirmed_by"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_applications_onboarding_status"');
    await queryRunner.query(`
      ALTER TABLE "applications"
        DROP COLUMN IF EXISTS "onboarding_rejected_reason",
        DROP COLUMN IF EXISTS "onboarding_rejected_at",
        DROP COLUMN IF EXISTS "planned_onboard_at",
        DROP COLUMN IF EXISTS "onboarding_confirmed_by_id",
        DROP COLUMN IF EXISTS "onboarding_confirmed_at",
        DROP COLUMN IF EXISTS "onboarding_status"
    `);
  }
}
