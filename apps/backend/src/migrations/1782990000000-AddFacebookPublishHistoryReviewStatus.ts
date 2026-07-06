import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFacebookPublishHistoryReviewStatus1782990000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      ADD COLUMN IF NOT EXISTS "facebook_review_status" varchar NOT NULL DEFAULT 'UNKNOWN'
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      ADD COLUMN IF NOT EXISTS "message" text NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      ADD COLUMN IF NOT EXISTS "external_post_url" text NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      ADD COLUMN IF NOT EXISTS "last_status_checked_at" timestamp NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      ADD COLUMN IF NOT EXISTS "last_status_check_message" text NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_facebook_publish_histories_review_status"
      ON "facebook_publish_histories" ("facebook_review_status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_facebook_publish_histories_review_status"`);
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      DROP COLUMN IF EXISTS "last_status_check_message"
    `);
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      DROP COLUMN IF EXISTS "last_status_checked_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      DROP COLUMN IF EXISTS "external_post_url"
    `);
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      DROP COLUMN IF EXISTS "message"
    `);
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      DROP COLUMN IF EXISTS "facebook_review_status"
    `);
  }
}
