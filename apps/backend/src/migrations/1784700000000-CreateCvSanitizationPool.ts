import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCvSanitizationPool1784700000000 implements MigrationInterface {
  name = 'CreateCvSanitizationPool1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cv_sanitization_jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "original_cv_document_id" uuid NOT NULL,
        "clean_cv_document_id" uuid NULL,
        "worker_id" uuid NULL,
        "status" varchar NOT NULL DEFAULT 'QUEUED',
        "attempt" integer NOT NULL DEFAULT 0,
        "max_attempts" integer NOT NULL DEFAULT 2,
        "input_hash" varchar NOT NULL,
        "source_file_path" text NOT NULL,
        "source_storage_path" text NOT NULL,
        "source_mime_type" varchar NOT NULL,
        "output_file_path" text NOT NULL,
        "output_storage_path" text NOT NULL,
        "output_hash" varchar NULL,
        "error_code" varchar NULL,
        "error_message_safe" text NULL,
        "container_exit_code" integer NULL,
        "queued_at" timestamp NOT NULL DEFAULT now(),
        "assigned_at" timestamp NULL,
        "started_at" timestamp NULL,
        "finished_at" timestamp NULL,
        "lease_expires_at" timestamp NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_sanitization_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cv_sanitization_jobs_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cv_sanitization_jobs_original_cv" FOREIGN KEY ("original_cv_document_id") REFERENCES "cv_documents"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cv_sanitization_jobs_clean_cv" FOREIGN KEY ("clean_cv_document_id") REFERENCES "cv_documents"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cv_sanitizer_workers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "runtime_type" varchar NOT NULL,
        "runtime_container_id" varchar NULL,
        "runtime_container_name" varchar NULL,
        "status" varchar NOT NULL DEFAULT 'STARTING',
        "current_job_id" uuid NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "ready_at" timestamp NULL,
        "reserved_at" timestamp NULL,
        "started_at" timestamp NULL,
        "terminated_at" timestamp NULL,
        "last_heartbeat_at" timestamp NULL,
        "lease_expires_at" timestamp NULL,
        "failure_reason" text NULL,
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_sanitizer_workers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cv_sanitizer_workers_current_job" FOREIGN KEY ("current_job_id") REFERENCES "cv_sanitization_jobs"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_cv_sanitization_jobs_worker'
            AND table_name = 'cv_sanitization_jobs'
        ) THEN
          ALTER TABLE "cv_sanitization_jobs"
          ADD CONSTRAINT "FK_cv_sanitization_jobs_worker"
          FOREIGN KEY ("worker_id") REFERENCES "cv_sanitizer_workers"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cv_sanitization_jobs_queue" ON "cv_sanitization_jobs" ("status", "queued_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cv_sanitization_jobs_application_cv" ON "cv_sanitization_jobs" ("application_id", "original_cv_document_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cv_sanitization_jobs_stale_lease" ON "cv_sanitization_jobs" ("status", "lease_expires_at") WHERE "lease_expires_at" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cv_sanitization_jobs_worker" ON "cv_sanitization_jobs" ("worker_id") WHERE "worker_id" IS NOT NULL`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cv_sanitization_jobs_active_input"
      ON "cv_sanitization_jobs" ("application_id", "original_cv_document_id", "input_hash")
      WHERE "status" IN ('QUEUED', 'ASSIGNED', 'PROCESSING', 'RETRY_PENDING')
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cv_sanitizer_workers_ready" ON "cv_sanitizer_workers" ("status", "ready_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cv_sanitizer_workers_stale_lease" ON "cv_sanitizer_workers" ("status", "lease_expires_at") WHERE "lease_expires_at" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cv_sanitizer_workers_runtime_container" ON "cv_sanitizer_workers" ("runtime_container_id") WHERE "runtime_container_id" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cv_sanitizer_workers_current_job" ON "cv_sanitizer_workers" ("current_job_id") WHERE "current_job_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cv_sanitizer_workers_capacity" ON "cv_sanitizer_workers" ("status", "created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cv_sanitization_jobs" DROP CONSTRAINT IF EXISTS "FK_cv_sanitization_jobs_worker"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cv_sanitizer_workers_capacity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cv_sanitizer_workers_current_job"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cv_sanitizer_workers_runtime_container"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cv_sanitizer_workers_stale_lease"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cv_sanitizer_workers_ready"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cv_sanitization_jobs_active_input"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cv_sanitization_jobs_worker"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cv_sanitization_jobs_stale_lease"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cv_sanitization_jobs_application_cv"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cv_sanitization_jobs_queue"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cv_sanitizer_workers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cv_sanitization_jobs"`);
  }
}
