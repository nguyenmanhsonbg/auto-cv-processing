import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFacebookTargetLastDiscoveredAt1783115000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      ADD COLUMN IF NOT EXISTS "last_discovered_at" timestamp NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      DROP COLUMN IF EXISTS "last_discovered_at"
    `);
  }
}
