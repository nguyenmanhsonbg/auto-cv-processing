import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAmisHrStageReminderTables1785000000000 implements MigrationInterface {
  name = 'CreateAmisHrStageReminderTables1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "amis_hr_mappings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "amis_account_id" varchar NOT NULL,
        "amis_account_name" varchar NULL,
        "hr_user_id" uuid NOT NULL,
        "hr_email" varchar NOT NULL,
        "hr_name" varchar NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_amis_hr_mappings_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_amis_hr_mappings_account" UNIQUE ("amis_account_id"),
        CONSTRAINT "FK_amis_hr_mappings_hr_user" FOREIGN KEY ("hr_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_amis_hr_mappings_hr_user"
      ON "amis_hr_mappings" ("hr_user_id")
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "amis_application_stage_reminders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "amis_recruitment_id" varchar NOT NULL,
        "amis_candidate_id" varchar NOT NULL,
        "amis_recruitment_round_id" varchar NOT NULL,
        "amis_recruitment_round_name" varchar NULL,
        "stage_entered_at" timestamp NOT NULL,
        "candidate_amis_url" text NULL,
        "hr_mapping_id" uuid NULL,
        "hr_user_id" uuid NULL,
        "hr_email" varchar NULL,
        "hr_name" varchar NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "closed_at" timestamp NULL,
        "first_reminder_sent_at" timestamp NULL,
        "second_reminder_sent_at" timestamp NULL,
        "last_error" text NULL,
        "last_error_at" timestamp NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_amis_application_stage_reminders_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_amis_stage_reminders_cycle" UNIQUE ("application_id", "amis_recruitment_round_id", "stage_entered_at"),
        CONSTRAINT "FK_amis_stage_reminders_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_amis_stage_reminders_mapping" FOREIGN KEY ("hr_mapping_id") REFERENCES "amis_hr_mappings"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_amis_stage_reminders_hr_user" FOREIGN KEY ("hr_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_amis_stage_reminders_due"
      ON "amis_application_stage_reminders" ("is_active", "stage_entered_at", "first_reminder_sent_at", "second_reminder_sent_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_amis_stage_reminders_hr"
      ON "amis_application_stage_reminders" ("hr_email", "is_active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "amis_application_stage_reminders"');
    await queryRunner.query('DROP TABLE IF EXISTS "amis_hr_mappings"');
  }
}
