import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSummaryToJobDescriptions1782950000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      ADD COLUMN IF NOT EXISTS "summary" varchar(500)
    `);

    await queryRunner.query(`
      UPDATE "job_descriptions"
      SET "summary" = LEFT(COALESCE("description", ''), 500)
      WHERE "summary" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      ALTER COLUMN "summary" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      DROP COLUMN IF EXISTS "summary"
    `);
  }
}
