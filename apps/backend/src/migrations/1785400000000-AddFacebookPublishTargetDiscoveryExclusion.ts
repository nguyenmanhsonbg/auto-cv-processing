import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFacebookPublishTargetDiscoveryExclusion1785400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      ADD COLUMN IF NOT EXISTS "excluded_from_discovery" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      DROP COLUMN IF EXISTS "excluded_from_discovery"
    `);
  }
}
