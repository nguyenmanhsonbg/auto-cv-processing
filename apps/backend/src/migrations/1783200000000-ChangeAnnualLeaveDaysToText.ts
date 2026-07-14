import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeAnnualLeaveDaysToText1783200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      ALTER COLUMN "annual_leave_days" TYPE text
      USING "annual_leave_days"::text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      ALTER COLUMN "annual_leave_days" TYPE integer
      USING (
        CASE
          WHEN trim("annual_leave_days") ~ '^\\d+$' THEN trim("annual_leave_days")::integer
          ELSE NULL
        END
      )
    `);
  }
}
