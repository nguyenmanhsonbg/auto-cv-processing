import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobPostingFormQuestionSetSnapshot1783300000000 implements MigrationInterface {
  name = 'AddJobPostingFormQuestionSetSnapshot1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_postings"
      ADD COLUMN IF NOT EXISTS "form_question_set_id" uuid NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_job_postings_form_question_set"
      ON "job_postings" ("form_question_set_id")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_job_postings_form_question_set'
            AND table_name = 'job_postings'
        ) THEN
          ALTER TABLE "job_postings"
          ADD CONSTRAINT "FK_job_postings_form_question_set"
          FOREIGN KEY ("form_question_set_id") REFERENCES "question_sets"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_postings"
      DROP CONSTRAINT IF EXISTS "FK_job_postings_form_question_set"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_job_postings_form_question_set"`);
    await queryRunner.query(`
      ALTER TABLE "job_postings"
      DROP COLUMN IF EXISTS "form_question_set_id"
    `);
  }
}
