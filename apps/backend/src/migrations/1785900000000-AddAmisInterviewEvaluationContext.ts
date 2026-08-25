import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmisInterviewEvaluationContext1785900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.query(
      `SELECT to_regclass('public.interview_evaluation_rounds') IS NOT NULL AS exists`,
    );
    if (!tableExists[0]?.exists) return;

    await queryRunner.query(`
      ALTER TABLE "interview_evaluation_rounds"
      ADD COLUMN IF NOT EXISTS "amis_round_id" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "interview_evaluation_rounds"
      ADD COLUMN IF NOT EXISTS "amis_round_type" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "interview_evaluation_rounds"
      ADD COLUMN IF NOT EXISTS "amis_sort_order" integer
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_interview_evaluation_rounds_amis_round"
      ON "interview_evaluation_rounds" ("case_id", "amis_round_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_interview_evaluation_rounds_amis_round"');
    await queryRunner.query('ALTER TABLE "interview_evaluation_rounds" DROP COLUMN IF EXISTS "amis_sort_order"');
    await queryRunner.query('ALTER TABLE "interview_evaluation_rounds" DROP COLUMN IF EXISTS "amis_round_type"');
    await queryRunner.query('ALTER TABLE "interview_evaluation_rounds" DROP COLUMN IF EXISTS "amis_round_id"');
  }
}
