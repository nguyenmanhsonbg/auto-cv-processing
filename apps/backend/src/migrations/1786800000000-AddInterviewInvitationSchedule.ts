import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInterviewInvitationSchedule1786800000000 implements MigrationInterface {
  name = 'AddInterviewInvitationSchedule1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "amis_candidate_stage_notifications"
      ADD COLUMN IF NOT EXISTS "interview_scheduled_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "interview_ends_at" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "interview_timezone" varchar NULL,
      ADD COLUMN IF NOT EXISTS "interview_duration_minutes" integer NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "amis_candidate_stage_notifications"
      DROP COLUMN IF EXISTS "interview_scheduled_at",
      DROP COLUMN IF EXISTS "interview_ends_at",
      DROP COLUMN IF EXISTS "interview_timezone",
      DROP COLUMN IF EXISTS "interview_duration_minutes"
    `);
  }
}
