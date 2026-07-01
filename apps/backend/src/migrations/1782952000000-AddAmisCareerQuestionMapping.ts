import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmisCareerQuestionMapping1782952000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "amis_careers"
      ADD COLUMN IF NOT EXISTS "question_category_names" jsonb NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "interview_sessions"
      ADD COLUMN IF NOT EXISTS "amis_career_id" varchar NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_interview_sessions_amis_career_id"
      ON "interview_sessions" ("amis_career_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_interview_sessions_amis_career_id"`);
    await queryRunner.query(`ALTER TABLE "interview_sessions" DROP COLUMN IF EXISTS "amis_career_id"`);
    await queryRunner.query(`ALTER TABLE "amis_careers" DROP COLUMN IF EXISTS "question_category_names"`);
  }
}
