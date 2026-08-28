import { MigrationInterface, QueryRunner } from 'typeorm';

export class BindEvaluationHandoffsToAmisContext1786200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "auth_evaluation_handoffs"
      ADD COLUMN IF NOT EXISTS "amis_user_id" varchar(100) NULL,
      ADD COLUMN IF NOT EXISTS "amis_recruitment_id" varchar(100) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "auth_evaluation_handoffs"
      DROP COLUMN IF EXISTS "amis_recruitment_id",
      DROP COLUMN IF EXISTS "amis_user_id"
    `);
  }
}
