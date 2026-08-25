import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInterviewEvaluationWorkflow1785600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "interview_evaluation_cases" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "candidate_id" uuid NOT NULL,
        "job_posting_id" uuid NOT NULL,
        "job_description_version_id" uuid NOT NULL,
        "template" character varying NOT NULL,
        "created_by_id" uuid NOT NULL,
        "current_round_id" uuid,
        "created_at" timestamp without time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interview_evaluation_cases_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interview_evaluation_cases_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_interview_evaluation_cases_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_interview_evaluation_cases_application"
      ON "interview_evaluation_cases" ("application_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "interview_evaluation_rounds" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "case_id" uuid NOT NULL,
        "round_key" character varying NOT NULL,
        "round_name" character varying NOT NULL,
        "sort_order" integer NOT NULL,
        "status" character varying NOT NULL DEFAULT 'READY_TO_EVALUATE',
        "hrbp_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "committee_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "aggregate_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "version" integer NOT NULL DEFAULT 1,
        "completed_by_id" uuid,
        "completed_at" timestamp without time zone,
        "created_at" timestamp without time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interview_evaluation_rounds_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interview_evaluation_rounds_case" FOREIGN KEY ("case_id") REFERENCES "interview_evaluation_cases"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_interview_evaluation_rounds_completed_by" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_interview_evaluation_rounds_case_key"
      ON "interview_evaluation_rounds" ("case_id", "round_key")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "interview_evaluation_reviewers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "round_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "section" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "form_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "submitted_at" timestamp without time zone,
        "created_at" timestamp without time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interview_evaluation_reviewers_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interview_evaluation_reviewers_round" FOREIGN KEY ("round_id") REFERENCES "interview_evaluation_rounds"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_interview_evaluation_reviewers_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_interview_evaluation_reviewers_round_user_section"
      ON "interview_evaluation_reviewers" ("round_id", "user_id", "section")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "interview_evaluation_audits" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "case_id" uuid NOT NULL,
        "round_id" uuid NOT NULL,
        "actor_id" uuid NOT NULL,
        "action" character varying NOT NULL,
        "from_status" character varying,
        "to_status" character varying,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interview_evaluation_audits_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interview_evaluation_audits_case" FOREIGN KEY ("case_id") REFERENCES "interview_evaluation_cases"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_interview_evaluation_audits_round" FOREIGN KEY ("round_id") REFERENCES "interview_evaluation_rounds"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_interview_evaluation_audits_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_interview_evaluation_audits_round_created"
      ON "interview_evaluation_audits" ("round_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_interview_evaluation_audits_round_created"');
    await queryRunner.query('DROP TABLE IF EXISTS "interview_evaluation_audits"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_interview_evaluation_reviewers_round_user_section"');
    await queryRunner.query('DROP TABLE IF EXISTS "interview_evaluation_reviewers"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_interview_evaluation_rounds_case_key"');
    await queryRunner.query('DROP TABLE IF EXISTS "interview_evaluation_rounds"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_interview_evaluation_cases_application"');
    await queryRunner.query('DROP TABLE IF EXISTS "interview_evaluation_cases"');
  }
}
