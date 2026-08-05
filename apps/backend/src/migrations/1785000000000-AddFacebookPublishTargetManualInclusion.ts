import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFacebookPublishTargetManualInclusion1785000000000 implements MigrationInterface {
  name = 'AddFacebookPublishTargetManualInclusion1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
        ADD COLUMN IF NOT EXISTS "manual_included" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "manual_included_at" timestamp NULL,
        ADD COLUMN IF NOT EXISTS "manual_included_by" uuid NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
        DROP COLUMN IF EXISTS "manual_included_by",
        DROP COLUMN IF EXISTS "manual_included_at",
        DROP COLUMN IF EXISTS "manual_included"
    `);
  }
}
