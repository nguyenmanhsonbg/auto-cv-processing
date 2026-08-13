import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFacebookPublishQuotaReservations1783700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      ADD COLUMN IF NOT EXISTS "reservation_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      ADD COLUMN IF NOT EXISTS "reservation_expires_at" timestamp NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_facebook_publish_histories_reservation_id"
      ON "facebook_publish_histories" ("reservation_id")
      WHERE "reservation_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_facebook_publish_histories_reservation_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      DROP COLUMN IF EXISTS "reservation_expires_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_histories"
      DROP COLUMN IF EXISTS "reservation_id"
    `);
  }
}
