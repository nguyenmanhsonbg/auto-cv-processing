import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchedulingFieldsToSession1776308195039 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'meetingplatform_enum'
        ) THEN
          CREATE TYPE "meetingplatform_enum" AS ENUM ('MS_TEAMS', 'GOOGLE_MEET');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE IF EXISTS "interview_sessions"
      ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP NULL
    `);

    await queryRunner.query(`
      ALTER TABLE IF EXISTS "interview_sessions"
      ADD COLUMN IF NOT EXISTS "meetingPlatform" "meetingplatform_enum" NULL
    `);

    await queryRunner.query(`
      ALTER TABLE IF EXISTS "interview_sessions"
      ADD COLUMN IF NOT EXISTS "meetingLink" VARCHAR NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "interview_sessions"
      DROP COLUMN IF EXISTS "meetingLink"
    `);

    await queryRunner.query(`
      ALTER TABLE IF EXISTS "interview_sessions"
      DROP COLUMN IF EXISTS "meetingPlatform"
    `);

    await queryRunner.query(`
      ALTER TABLE IF EXISTS "interview_sessions"
      DROP COLUMN IF EXISTS "scheduledAt"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "meetingplatform_enum"
    `);
  }
}
