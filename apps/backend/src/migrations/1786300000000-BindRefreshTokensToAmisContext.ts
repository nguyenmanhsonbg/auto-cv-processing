import { MigrationInterface, QueryRunner } from 'typeorm';

export class BindRefreshTokensToAmisContext1786300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "auth_refresh_tokens"
      ADD COLUMN IF NOT EXISTS "amis_user_id" varchar(100) NULL,
      ADD COLUMN IF NOT EXISTS "amis_recruitment_id" varchar(100) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "auth_refresh_tokens"
      DROP COLUMN IF EXISTS "amis_recruitment_id",
      DROP COLUMN IF EXISTS "amis_user_id"
    `);
  }
}
