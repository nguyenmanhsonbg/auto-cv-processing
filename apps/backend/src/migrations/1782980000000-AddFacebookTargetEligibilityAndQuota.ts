import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFacebookTargetEligibilityAndQuota1782980000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      ADD COLUMN IF NOT EXISTS "eligibility_status" varchar NOT NULL DEFAULT 'UNKNOWN'
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      ADD COLUMN IF NOT EXISTS "eligibility_reason" text NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      ADD COLUMN IF NOT EXISTS "last_verified_at" timestamp NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      ADD COLUMN IF NOT EXISTS "daily_publish_limit" integer NOT NULL DEFAULT 10
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      DROP COLUMN IF EXISTS "daily_publish_limit"
    `);
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      DROP COLUMN IF EXISTS "last_verified_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      DROP COLUMN IF EXISTS "eligibility_reason"
    `);
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      DROP COLUMN IF EXISTS "eligibility_status"
    `);
  }
}
