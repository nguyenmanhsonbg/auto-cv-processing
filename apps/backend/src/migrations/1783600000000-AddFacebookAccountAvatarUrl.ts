import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFacebookAccountAvatarUrl1783600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "facebook_accounts"
      ADD COLUMN IF NOT EXISTS "avatar_url" text NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "facebook_accounts"
      DROP COLUMN IF EXISTS "avatar_url"
    `);
  }
}
