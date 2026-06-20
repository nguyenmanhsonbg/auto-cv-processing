import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRecruitmentPhase1Foundation1781943070523 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertRequiredTables(queryRunner, [
      'users',
      'candidates',
      'positions',
      'levels',
      'questions',
    ]);

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "job_descriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" varchar NOT NULL,
        "position_id" uuid NULL,
        "level_id" uuid NULL,
        "description" text NOT NULL,
        "requirements" jsonb NOT NULL,
        "benefits" jsonb NULL,
        "status" varchar NOT NULL DEFAULT 'DRAFT',
        "created_by_id" uuid NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_job_descriptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_job_descriptions_position" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_job_descriptions_level" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_job_descriptions_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "job_description_versions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "job_description_id" uuid NOT NULL,
        "version_no" integer NOT NULL,
        "snapshot" jsonb NOT NULL,
        "status" varchar NOT NULL DEFAULT 'ACTIVE',
        "created_by_id" uuid NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_job_description_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_job_description_versions_job_description" FOREIGN KEY ("job_description_id") REFERENCES "job_descriptions"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_job_description_versions_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "job_postings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "job_description_id" uuid NOT NULL,
        "job_description_version_id" uuid NOT NULL,
        "title" varchar NOT NULL,
        "public_slug" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'DRAFT',
        "open_at" timestamp NULL,
        "close_at" timestamp NULL,
        "created_by_id" uuid NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_job_postings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_job_postings_job_description" FOREIGN KEY ("job_description_id") REFERENCES "job_descriptions"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_job_postings_jd_version" FOREIGN KEY ("job_description_version_id") REFERENCES "job_description_versions"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_job_postings_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "channel_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "channel" varchar NOT NULL,
        "name" varchar NOT NULL,
        "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "status" varchar NOT NULL DEFAULT 'ACTIVE',
        "created_by_id" uuid NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_channel_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_channel_accounts_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "channel_postings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "job_posting_id" uuid NOT NULL,
        "channel" varchar NOT NULL,
        "external_posting_id" varchar NULL,
        "status" varchar NOT NULL DEFAULT 'DRAFT',
        "publish_payload" jsonb NULL,
        "published_url" text NULL,
        "last_sync_at" timestamp NULL,
        "error_message" text NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_channel_postings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_channel_postings_job_posting" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "applications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "candidate_id" uuid NOT NULL,
        "job_posting_id" uuid NOT NULL,
        "job_description_version_id" uuid NOT NULL,
        "source" varchar NOT NULL,
        "source_channel" varchar NULL,
        "external_application_id" varchar NULL,
        "status" varchar NOT NULL DEFAULT 'APPLICATION_CREATED',
        "current_cv_document_id" uuid NULL,
        "mapping_status" varchar NULL,
        "form_status" varchar NULL,
        "ai_screening_status" varchar NULL,
        "hr_review_status" varchar NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_applications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_applications_candidate" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_applications_job_posting" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_applications_jd_version" FOREIGN KEY ("job_description_version_id") REFERENCES "job_description_versions"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "application_sources" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "source_type" varchar NOT NULL,
        "channel" varchar NULL,
        "external_lead_id" varchar NULL,
        "external_application_id" varchar NULL,
        "raw_payload" jsonb NULL,
        "received_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_application_sources" PRIMARY KEY ("id"),
        CONSTRAINT "FK_application_sources_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cv_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "candidate_id" uuid NOT NULL,
        "document_type" varchar NOT NULL,
        "version_no" integer NOT NULL,
        "original_file_name" varchar NOT NULL,
        "mime_type" varchar NOT NULL,
        "file_size" bigint NOT NULL,
        "original_file_hash" varchar NULL,
        "clean_file_hash" varchar NULL,
        "storage_zone" varchar NOT NULL,
        "storage_path" text NOT NULL,
        "scan_status" varchar NOT NULL DEFAULT 'PENDING',
        "sanitize_status" varchar NOT NULL DEFAULT 'PENDING',
        "parse_status" varchar NOT NULL DEFAULT 'PENDING',
        "is_current" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cv_documents" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cv_documents_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cv_documents_candidate" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_applications_current_cv_document'
        ) THEN
          ALTER TABLE "applications"
          ADD CONSTRAINT "FK_applications_current_cv_document"
          FOREIGN KEY ("current_cv_document_id") REFERENCES "cv_documents"("id") ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parsed_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "cv_document_id" uuid NOT NULL,
        "candidate_id" uuid NOT NULL,
        "parsed_data" jsonb NOT NULL,
        "normalized_text_hash" varchar NULL,
        "parser_version" varchar NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_parsed_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_parsed_profiles_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_parsed_profiles_cv_document" FOREIGN KEY ("cv_document_id") REFERENCES "cv_documents"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_parsed_profiles_candidate" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "duplicate_checks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "check_type" varchar NOT NULL,
        "status" varchar NOT NULL,
        "matched_entity_type" varchar NULL,
        "matched_entity_id" varchar NULL,
        "score" numeric NULL,
        "details" jsonb NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_duplicate_checks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_duplicate_checks_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mapping_results" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "job_description_version_id" uuid NOT NULL,
        "clean_cv_document_id" uuid NOT NULL,
        "parsed_profile_id" uuid NULL,
        "score" numeric NOT NULL,
        "strengths" jsonb NULL,
        "gaps" jsonb NULL,
        "recommendation" varchar NOT NULL,
        "status" varchar NOT NULL,
        "model_version" varchar NULL,
        "evidence" jsonb NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mapping_results" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mapping_results_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_mapping_results_jd_version" FOREIGN KEY ("job_description_version_id") REFERENCES "job_description_versions"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_mapping_results_clean_cv" FOREIGN KEY ("clean_cv_document_id") REFERENCES "cv_documents"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_mapping_results_parsed_profile" FOREIGN KEY ("parsed_profile_id") REFERENCES "parsed_profiles"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "question_sets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "job_description_id" uuid NULL,
        "job_description_version_id" uuid NULL,
        "name" varchar NOT NULL,
        "position_id" uuid NULL,
        "level_id" uuid NULL,
        "status" varchar NOT NULL DEFAULT 'DRAFT',
        "created_by_id" uuid NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_question_sets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_question_sets_job_description" FOREIGN KEY ("job_description_id") REFERENCES "job_descriptions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_question_sets_jd_version" FOREIGN KEY ("job_description_version_id") REFERENCES "job_description_versions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_question_sets_position" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_question_sets_level" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_question_sets_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "question_set_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "question_set_id" uuid NOT NULL,
        "question_id" uuid NULL,
        "question_text_snapshot" text NOT NULL,
        "question_type" varchar NOT NULL,
        "order_index" integer NOT NULL DEFAULT 0,
        "required" boolean NOT NULL DEFAULT true,
        "metadata" jsonb NULL,
        CONSTRAINT "PK_question_set_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_question_set_items_question_set" FOREIGN KEY ("question_set_id") REFERENCES "question_sets"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_question_set_items_question" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "form_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "question_set_id" uuid NOT NULL,
        "token_hash" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'CREATED',
        "expires_at" timestamp NOT NULL,
        "sent_at" timestamp NULL,
        "opened_at" timestamp NULL,
        "submitted_at" timestamp NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_form_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_form_sessions_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_form_sessions_question_set" FOREIGN KEY ("question_set_id") REFERENCES "question_sets"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "form_answers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "form_session_id" uuid NOT NULL,
        "application_id" uuid NOT NULL,
        "question_set_item_id" uuid NOT NULL,
        "answer" jsonb NOT NULL,
        "answered_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_form_answers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_form_answers_form_session" FOREIGN KEY ("form_session_id") REFERENCES "form_sessions"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_form_answers_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_form_answers_question_set_item" FOREIGN KEY ("question_set_item_id") REFERENCES "question_set_items"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_screening_results" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "mapping_result_id" uuid NOT NULL,
        "form_session_id" uuid NOT NULL,
        "final_score" numeric NULL,
        "recommendation" varchar NOT NULL,
        "summary" text NULL,
        "strengths" jsonb NULL,
        "gaps" jsonb NULL,
        "risks" jsonb NULL,
        "status" varchar NOT NULL,
        "model" varchar NULL,
        "prompt_version" varchar NULL,
        "raw_result" jsonb NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_screening_results" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_screening_results_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_ai_screening_results_mapping" FOREIGN KEY ("mapping_result_id") REFERENCES "mapping_results"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_ai_screening_results_form_session" FOREIGN KEY ("form_session_id") REFERENCES "form_sessions"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hr_reviews" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "reviewer_id" uuid NOT NULL,
        "decision" varchar NOT NULL,
        "comment" text NULL,
        "reason_codes" jsonb NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_hr_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "FK_hr_reviews_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_hr_reviews_reviewer" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "from_status" varchar NULL,
        "to_status" varchar NOT NULL,
        "event_type" varchar NOT NULL,
        "actor_type" varchar NOT NULL,
        "actor_id" varchar NULL,
        "metadata" jsonb NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workflow_events_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "actor_type" varchar NOT NULL,
        "actor_id" varchar NULL,
        "action" varchar NOT NULL,
        "object_type" varchar NOT NULL,
        "object_id" varchar NULL,
        "application_id" uuid NULL,
        "metadata" jsonb NULL,
        "ip_address" varchar NULL,
        "user_agent" text NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "channel_conversations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "channel" varchar NOT NULL,
        "external_conversation_id" varchar NOT NULL,
        "candidate_id" uuid NULL,
        "application_id" uuid NULL,
        "job_posting_id" uuid NULL,
        "status" varchar NOT NULL DEFAULT 'OPEN',
        "last_message_at" timestamp NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_channel_conversations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_channel_conversations_candidate" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_channel_conversations_application" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_channel_conversations_job_posting" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "channel_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversation_id" uuid NOT NULL,
        "direction" varchar NOT NULL,
        "sender_type" varchar NOT NULL,
        "message_type" varchar NOT NULL DEFAULT 'TEXT',
        "content" text NULL,
        "raw_payload" jsonb NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_channel_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_channel_messages_conversation" FOREIGN KEY ("conversation_id") REFERENCES "channel_conversations"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bot_knowledge_sources" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "source_type" varchar NOT NULL,
        "job_description_id" uuid NULL,
        "job_posting_id" uuid NULL,
        "title" varchar NOT NULL,
        "content" text NOT NULL,
        "status" varchar NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bot_knowledge_sources" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bot_knowledge_sources_job_description" FOREIGN KEY ("job_description_id") REFERENCES "job_descriptions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_bot_knowledge_sources_job_posting" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE SET NULL
      )
    `);

    await this.createIndexes(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_knowledge_sources"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "channel_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "channel_conversations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hr_reviews"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_screening_results"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "form_answers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "form_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "question_set_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "question_sets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mapping_results"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "duplicate_checks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "parsed_profiles"`);
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "applications"
      DROP CONSTRAINT IF EXISTS "FK_applications_current_cv_document"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "cv_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "application_sources"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "applications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "channel_postings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "channel_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "job_postings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "job_description_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "job_descriptions"`);
  }

  private async assertRequiredTables(queryRunner: QueryRunner, tableNames: string[]): Promise<void> {
    const rows = await queryRunner.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1)
      `,
      [tableNames],
    );
    const existing = new Set(rows.map((row: { table_name: string }) => row.table_name));
    const missing = tableNames.filter((tableName) => !existing.has(tableName));

    if (missing.length > 0) {
      throw new Error(
        `Cannot create Recruitment Phase 1 foundation because required baseline table(s) are missing: ${missing.join(', ')}`,
      );
    }
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    const indexes = [
      `CREATE INDEX IF NOT EXISTS "IDX_job_descriptions_status" ON "job_descriptions" ("status")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_job_description_versions_version" ON "job_description_versions" ("job_description_id", "version_no")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_job_postings_public_slug" ON "job_postings" ("public_slug")`,
      `CREATE INDEX IF NOT EXISTS "IDX_job_postings_status" ON "job_postings" ("status")`,
      `CREATE INDEX IF NOT EXISTS "IDX_channel_accounts_channel_name" ON "channel_accounts" ("channel", "name")`,
      `CREATE INDEX IF NOT EXISTS "IDX_channel_postings_job_channel" ON "channel_postings" ("job_posting_id", "channel")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_channel_postings_external" ON "channel_postings" ("channel", "external_posting_id") WHERE "external_posting_id" IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS "IDX_applications_status" ON "applications" ("status")`,
      `CREATE INDEX IF NOT EXISTS "IDX_applications_candidate" ON "applications" ("candidate_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_applications_job_posting" ON "applications" ("job_posting_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_applications_jd_version" ON "applications" ("job_description_version_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_applications_external" ON "applications" ("source_channel", "external_application_id") WHERE "external_application_id" IS NOT NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_application_sources_external" ON "application_sources" ("channel", "external_application_id") WHERE "channel" IS NOT NULL AND "external_application_id" IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS "IDX_application_sources_lead" ON "application_sources" ("external_lead_id") WHERE "external_lead_id" IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS "IDX_cv_documents_application" ON "cv_documents" ("application_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_cv_documents_candidate" ON "cv_documents" ("candidate_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_cv_documents_original_hash" ON "cv_documents" ("original_file_hash") WHERE "original_file_hash" IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS "IDX_cv_documents_clean_hash" ON "cv_documents" ("clean_file_hash") WHERE "clean_file_hash" IS NOT NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cv_documents_version" ON "cv_documents" ("application_id", "version_no", "document_type")`,
      `CREATE INDEX IF NOT EXISTS "IDX_cv_documents_current" ON "cv_documents" ("application_id") WHERE "is_current" = true`,
      `CREATE INDEX IF NOT EXISTS "IDX_parsed_profiles_application" ON "parsed_profiles" ("application_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_parsed_profiles_cv_document" ON "parsed_profiles" ("cv_document_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_parsed_profiles_text_hash" ON "parsed_profiles" ("normalized_text_hash") WHERE "normalized_text_hash" IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS "IDX_duplicate_checks_application" ON "duplicate_checks" ("application_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_duplicate_checks_type_status" ON "duplicate_checks" ("check_type", "status")`,
      `CREATE INDEX IF NOT EXISTS "IDX_mapping_results_application" ON "mapping_results" ("application_id")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_mapping_results_done" ON "mapping_results" ("application_id", "clean_cv_document_id", "job_description_version_id") WHERE "status" = 'DONE'`,
      `CREATE INDEX IF NOT EXISTS "IDX_question_set_items_order" ON "question_set_items" ("question_set_id", "order_index")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_form_sessions_token_hash" ON "form_sessions" ("token_hash")`,
      `CREATE INDEX IF NOT EXISTS "IDX_form_sessions_application" ON "form_sessions" ("application_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_form_sessions_active" ON "form_sessions" ("application_id", "question_set_id", "status")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_form_answers_item" ON "form_answers" ("form_session_id", "question_set_item_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_ai_screening_results_application" ON "ai_screening_results" ("application_id")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ai_screening_results_done" ON "ai_screening_results" ("application_id", "mapping_result_id", "form_session_id") WHERE "status" = 'DONE'`,
      `CREATE INDEX IF NOT EXISTS "IDX_hr_reviews_application" ON "hr_reviews" ("application_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_hr_reviews_timeline" ON "hr_reviews" ("application_id", "created_at")`,
      `CREATE INDEX IF NOT EXISTS "IDX_workflow_events_timeline" ON "workflow_events" ("application_id", "created_at")`,
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_application" ON "audit_logs" ("application_id", "created_at")`,
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_actor" ON "audit_logs" ("actor_type", "actor_id", "created_at")`,
      `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_object" ON "audit_logs" ("object_type", "object_id")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_channel_conversations_external" ON "channel_conversations" ("channel", "external_conversation_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_channel_conversations_last_message" ON "channel_conversations" ("last_message_at")`,
      `CREATE INDEX IF NOT EXISTS "IDX_channel_messages_timeline" ON "channel_messages" ("conversation_id", "created_at")`,
      `CREATE INDEX IF NOT EXISTS "IDX_bot_knowledge_sources_lookup" ON "bot_knowledge_sources" ("source_type", "job_description_id", "job_posting_id")`,
    ];

    for (const indexSql of indexes) {
      await queryRunner.query(indexSql);
    }
  }
}
