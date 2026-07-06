import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobPostingFormQuestionIds1782990000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_postings"
      ADD COLUMN IF NOT EXISTS "form_question_ids" jsonb NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_postings"
      DROP COLUMN IF EXISTS "form_question_ids"
    `);
  }
}
