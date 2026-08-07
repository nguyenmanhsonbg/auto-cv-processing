import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAmisCandidateStageNotifications1785100000000 implements MigrationInterface {
  name = 'CreateAmisCandidateStageNotifications1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "amis_candidate_stage_notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "amis_recruitment_id" varchar NOT NULL,
        "amis_candidate_id" varchar NOT NULL,
        "amis_recruitment_round_id" varchar NOT NULL,
        "amis_recruitment_round_name" varchar NULL,
        "candidate_email" varchar NOT NULL,
        "candidate_name" varchar NULL,
        "job_title" varchar NULL,
        "transitioned_at" timestamp NOT NULL,
        "status" varchar NOT NULL DEFAULT 'PENDING',
        "attempt_count" integer NOT NULL DEFAULT 0,
        "last_attempt_at" timestamp NULL,
        "next_attempt_at" timestamp NULL,
        "sent_at" timestamp NULL,
        "last_error" text NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_amis_candidate_stage_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_amis_candidate_stage_notifications_round" UNIQUE ("application_id", "amis_recruitment_id", "amis_recruitment_round_id"),
        CONSTRAINT "FK_amis_candidate_stage_notifications_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_amis_candidate_stage_notifications_due"
      ON "amis_candidate_stage_notifications" ("status", "next_attempt_at", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "amis_candidate_stage_notifications"');
  }
}
